import { ensureUserLabel } from '../gmail/labels.js';
import { modifyThreadLabels } from '../gmail/sync.js';
import { notifyOsMail } from '../notify/os.js';
import { newId, type Workflow, type WorkflowAction } from './catalog.js';
import {
  batchSizeForModel,
  decideRunMode,
  defaultActions,
  intentHints,
  planBatch,
  synthesizeReport,
} from './harness.js';
import { sanitizeRules } from './suggest.js';
import type { MailTarget } from './match.js';
import { patchWorkflow, recordRun, type WorkflowRun } from './store.js';
import { loadInboxTargets, loadTarget } from './targets.js';

async function applyAction(
  target: MailTarget,
  action: WorkflowAction,
  dryRun: boolean,
): Promise<{
    action: string;
    detail?: string;
    from?: string;
    subject?: string;
  }> {
  if (action.type === 'notify') {
    const title = action.title || 'Workflow';
    const body = `${target.fromName}: ${target.subject}`;
    const who = {
      from: target.fromName || target.fromEmail,
      subject: target.subject,
    };
    if (!dryRun) notifyOsMail(title, body);
    return { action: 'notify', detail: title, ...who };
  }
  if (action.type === 'star') {
    if (!dryRun) await modifyThreadLabels(target.id, ['STARRED'], []);
    return {
      action: 'star',
      from: target.fromName || target.fromEmail,
      subject: target.subject,
    };
  }
  if (action.type === 'removeFromInbox' || action.type === 'archive') {
    if (!dryRun) await modifyThreadLabels(target.id, [], ['INBOX']);
    return {
      action: 'archive',
      from: target.fromName || target.fromEmail,
      subject: target.subject,
    };
  }
  if (action.type === 'addLabel') {
    const name = action.name?.trim() || 'Filed';
    if (!dryRun) {
      const id = await ensureUserLabel(name);
      await modifyThreadLabels(target.id, [id], []);
    }
    return {
      action: 'addLabel',
      detail: name,
      from: target.fromName || target.fromEmail,
      subject: target.subject,
    };
  }
  if (action.type === 'report') {
    return {
      action: 'report',
      detail: action.text || action.title,
      from: target.fromName || target.fromEmail,
      subject: target.subject,
    };
  }
  return {
    action: action.type,
    from: target.fromName || target.fromEmail,
    subject: target.subject,
  };
}

export interface RunOptions {
  reason: WorkflowRun['reason'];
  dryRun?: boolean;
  threadId?: string;
  limit?: number;
  signal?: AbortSignal;
}

export function isStop(_e: unknown, signal?: AbortSignal): boolean {
  return Boolean(signal?.aborted);
}

export interface RunProgress {
  threadCount: number;
  scanned: number;
  actions: WorkflowRun['actions'];
  current?: { from: string; subject: string } | null;
  output?: string;
}

export async function runWorkflow(
  wf: Workflow,
  opts: RunOptions,
  onProgress?: (p: RunProgress) => void,
): Promise<WorkflowRun> {
  const dryRun = Boolean(opts.dryRun) || opts.reason === 'dry-run';
  const run: WorkflowRun = {
    id: newId('run'),
    workflowId: wf.id,
    at: new Date().toISOString(),
    reason: opts.reason,
    dryRun,
    threadCount: 0,
    actions: [],
  };

  if (!wf.approved && !dryRun) {
    run.error = 'Workflow is not approved';
    recordRun(run);
    return run;
  }

  const defaults = defaultActions(wf).map((a) =>
    a.type === 'addLabel' && !a.name?.trim()
      ? { ...a, name: wf.name || 'Filed' }
      : a,
  );
  const hints = intentHints(wf.english || wf.name);
  const chunk = Math.max(1, batchSizeForModel(wf.model.model || ''));

  let targets = opts.threadId
    ? [loadTarget(opts.threadId)].filter((t): t is MailTarget => Boolean(t))
    : loadInboxTargets(opts.limit ?? 120);
  targets = preferHinted(applyAgeScope(wf, targets), hints);
  run.threadCount = targets.length;
  onProgress?.({
    threadCount: run.threadCount,
    scanned: 0,
    actions: [],
    current: { from: wf.name, subject: 'Deciding how to run…' },
  });

  let mode: { report: boolean; act: boolean };
  try {
    mode = await decideRunMode(wf, opts.signal);
  } catch (e) {
    if (isStop(e, opts.signal)) {
      run.error = 'Stopped';
      recordRun(run);
      return run;
    }
    throw e;
  }
  const reportOnly = mode.report && !mode.act;
  const needReport = mode.report;

  try {
    let scanned = 0;
    let lastAiError: string | null = null;
    let aiOk = 0;
    if (mode.act) {
      for (let i = 0; i < targets.length; i += chunk) {
        if (opts.signal?.aborted) {
          run.error = 'Stopped';
          break;
        }
        const batch = targets.slice(i, i + chunk);
        const head = batch[0]!;
        onProgress?.({
          threadCount: run.threadCount,
          scanned,
          actions: run.actions,
          current: {
            from: head.fromName || head.fromEmail,
            subject: head.subject,
          },
        });
        let planned: Map<string, WorkflowAction[]>;
        try {
          planned = await planBatch(wf, batch, defaults, hints, opts.signal);
          aiOk += 1;
        } catch (e) {
          if (isStop(e, opts.signal)) {
            run.error = 'Stopped';
            break;
          }
          lastAiError = e instanceof Error ? e.message : String(e);
          console.warn('[workflow] harness batch failed', lastAiError);
          scanned += batch.length;
          onProgress?.({
            threadCount: run.threadCount,
            scanned,
            actions: run.actions,
          });
          continue;
        }
        for (const target of batch) {
          const calls = planned.get(target.id) ?? [];
          for (const action of calls) {
            const filled =
              action.type === 'addLabel' && !action.name?.trim()
                ? { ...action, name: wf.name || 'Filed' }
                : action;
            const applied = await applyAction(target, filled, dryRun);
            run.actions.push({ threadId: target.id, ...applied });
          }
          scanned += 1;
          onProgress?.({
            threadCount: run.threadCount,
            scanned,
            actions: run.actions,
            current: {
              from: target.fromName || target.fromEmail,
              subject: target.subject,
            },
          });
        }
      }
      if (run.error !== 'Stopped' && !aiOk && lastAiError) run.error = lastAiError;
    } else {
      scanned = targets.length;
      onProgress?.({
        threadCount: run.threadCount,
        scanned,
        actions: run.actions,
        current: { from: 'Inbox', subject: 'Writing answer…' },
      });
      aiOk = 1;
    }

    if (needReport && run.error !== 'Stopped' && !opts.signal?.aborted) {
      onProgress?.({
        threadCount: run.threadCount,
        scanned,
        actions: run.actions,
        current: { from: wf.name, subject: 'Writing answer…' },
      });
      try {
        const text = await synthesizeReport(wf, targets, run.actions, opts.signal);
        if (text) {
          run.output = text;
          onProgress?.({
            threadCount: run.threadCount,
            scanned,
            actions: run.actions,
            output: text,
            current: { from: wf.name, subject: 'Answer ready' },
          });
        }
      } catch (e) {
        if (isStop(e, opts.signal)) {
          run.error = 'Stopped';
        } else {
          console.warn('[workflow] report failed', e);
          const fallback = run.actions
            .filter((a) => a.action === 'report' && a.detail)
            .map((a) => a.detail)
            .join('\n\n');
          if (fallback) run.output = fallback;
          else if (!run.error) {
            run.error = e instanceof Error ? e.message : String(e);
          }
        }
      }
    }

    if (!dryRun) {
      patchWorkflow(wf.id, {
        lastRunAt: run.at,
        lastError: run.error === 'Stopped' ? null : (run.error ?? null),
      });
    }
  } catch (e) {
    if (isStop(e, opts.signal)) {
      run.error = 'Stopped';
    } else {
      run.error = e instanceof Error ? e.message : String(e);
      if (!dryRun) patchWorkflow(wf.id, { lastError: run.error });
    }
  }

  recordRun(run);
  console.log(
    `[workflow] ${wf.name} ${opts.reason}${dryRun ? ' dry-run' : ''} harness · ${run.actions.length} actions · ${targets.length} threads${run.output ? ' · report' : ''}`,
  );
  return run;
}

function preferHinted(targets: MailTarget[], hints: string[]): MailTarget[] {
  if (!hints.length) return targets;
  const hit: MailTarget[] = [];
  const rest: MailTarget[] = [];
  for (const t of targets) {
    const hay =
      `${t.fromName} ${t.fromEmail} ${t.subject} ${t.snippet} ${t.bodyPreview}`.toLowerCase();
    if (hints.some((h) => h.length > 2 && hay.includes(h))) hit.push(t);
    else rest.push(t);
  }
  return hit.length ? [...hit, ...rest] : targets;
}

function applyAgeScope(wf: Workflow, targets: MailTarget[]): MailTarget[] {
  const days = sanitizeRules(wf.english || wf.name, wf.rules ?? [])
    .map((r) => r.matchers?.maxAgeDays)
    .filter((n): n is number => typeof n === 'number' && n > 0);
  if (!days.length) return targets;
  const maxAge = Math.max(...days);
  const cutoff = Date.now() - maxAge * 86_400_000;
  return targets.filter((t) => !t.lastMessageAt || t.lastMessageAt >= cutoff);
}
