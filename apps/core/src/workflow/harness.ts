import { completeWithBinding } from '../ai/provider.js';
import type { MailTarget } from './match.js';
import { sanitizeRules } from './suggest.js';
import type { Workflow, WorkflowAction } from './catalog.js';

const STOP = new Set(
  `a an the and or to of in on for from with without any all when then that this those these they them their need needs needed be been is are was were moved move remove removed out inbox folder folders archive archived separate email emails mail mails containing contains contain go going through latest week days properly split something should happen what etc last my`.split(
    /\s+/,
  ),
);

const ALLOWED = new Set(['notify', 'addLabel', 'archive', 'star', 'report']);

export function intentHints(english: string): string[] {
  const text = english.trim();
  const quoted = [...text.matchAll(/["“']([^"”']{2,})["”']/g)].map((m) =>
    m[1]!.trim(),
  );
  const hyphen = text.match(/[A-Za-z][\w]*-[\w-]+/g) ?? [];
  const words = text.match(/[A-Za-z][\w.-]{2,}/g) ?? [];
  const keep = [...quoted, ...hyphen, ...words].flatMap((t) => {
    const low = t.toLowerCase();
    if (STOP.has(low)) return [];
    if (low.includes('-')) return [low, ...low.split('-').filter((p) => p.length > 2)];
    if (t.length >= 5) return [low];
    return [];
  });
  return [...new Set(keep)].slice(0, 12);
}

export function toolBundles(wf: Workflow): WorkflowAction[][] {
  return sanitizeRules(wf.english || wf.name, wf.rules ?? [])
    .map((r) =>
      (r.then ?? []).map(normalizeAction).filter((a): a is WorkflowAction => Boolean(a)),
    )
    .filter((then) => then.length);
}

const MUTATING = new Set([
  'addLabel',
  'archive',
  'star',
  'notify',
  'removeFromInbox',
]);

export type RunMode = { report: boolean; act: boolean };

export function compiledMode(wf: Workflow): RunMode {
  const types = toolBundles(wf).flat().map((a) => a.type);
  return {
    report: types.includes('report'),
    act: types.some((t) => MUTATING.has(t)),
  };
}

export function isReportOnly(wf: Workflow): boolean {
  const m = compiledMode(wf);
  return m.report && !m.act;
}

export function defaultActions(wf: Workflow): WorkflowAction[] {
  const bundles = toolBundles(wf);
  if (bundles.length === 1) return bundles[0]!;
  if (bundles.length > 1) return [];
  return [];
}

export function parseRunMode(text: string, compiled: RunMode): RunMode {
  const raw = text.trim();
  let model: Partial<RunMode> = {};
  try {
    const obj = extractJson(raw) as Record<string, unknown>;
    const mode = String(obj['mode'] ?? obj['run'] ?? '').toLowerCase();
    if (obj['report'] === true || mode === 'report' || mode === 'answer' || mode === 'both') {
      model.report = true;
    }
    if (obj['report'] === false) model.report = false;
    if (
      obj['act'] === true ||
      obj['actions'] === true ||
      mode === 'act' ||
      mode === 'both' ||
      mode === 'tools'
    ) {
      model.act = true;
    }
    if (obj['act'] === false) model.act = false;
  } catch {
    if (/^\s*(report|answer|brief)/i.test(raw) && !/\bact\b/i.test(raw)) {
      model = { report: true, act: false };
    } else if (/^\s*(act|tools|file|archive)\b/i.test(raw) && !/report/i.test(raw)) {
      model = { report: false, act: true };
    }
  }

  // Approved tools are the contract. The model may add a briefing only when
  // the compiled workflow is not already a filing-only run.
  if (compiled.act && !compiled.report) {
    return { report: false, act: true };
  }
  if (compiled.report && !compiled.act) {
    return { report: true, act: false };
  }
  if (compiled.report && compiled.act) {
    return {
      report: model.report !== false,
      act: model.act !== false,
    };
  }
  if (model.report === true && model.act !== true) return { report: true, act: false };
  if (model.act === true) return { report: model.report === true, act: true };
  return { report: true, act: false };
}

/** Skip an extra model call when the approved JSON already says filing vs answer. */
export function resolvedRunMode(wf: Workflow): RunMode | null {
  const compiled = compiledMode(wf);
  if (compiled.act && !compiled.report) return { report: false, act: true };
  if (compiled.report && !compiled.act) return { report: true, act: false };
  return null;
}

export async function decideRunMode(
  wf: Workflow,
  signal?: AbortSignal,
): Promise<RunMode> {
  const compiled = compiledMode(wf);
  const tools = [
    ...new Set(toolBundles(wf).flat().map((a) => a.type)),
  ].join(', ');
  const { text } = await completeWithBinding(
    wf.model.backend,
    wf.model.model,
    [
      'Workflow request:',
      wf.english.trim() || wf.description || wf.name,
      tools ? `Compiled tools (hints, may be wrong): ${tools}` : 'No compiled tools.',
      '',
      'Decide what this run should do. Respect the request.',
      'act=true if mail should be changed (remove, archive, label, star, notify).',
      'report=true only if they also want a written answer shown (list, priorities, summary).',
      'Filing/removing mail is act, not report. JSON only, e.g. {"report":false,"act":true}',
    ].join('\n'),
    'You classify a mail workflow. Reply with one JSON object. Mail stays on this computer.',
    signal,
  );
  return parseRunMode(text || '', compiled);
}

export function batchSizeForModel(model: string): number {
  if (/\b(1b|1\.5b|3b)\b/i.test(model)) return 1;
  return 5;
}

export function parseHarnessResponse(
  text: string,
  defaults: WorkflowAction[],
  ids: string[],
): Map<string, WorkflowAction[]> {
  const out = new Map<string, WorkflowAction[]>();
  for (const id of ids) out.set(id, []);
  const trimmed = text.trim();
  if (!trimmed) return out;

  if (ids.length === 1 && /^\s*yes\b/i.test(trimmed) && !trimmed.includes('{')) {
    out.set(ids[0]!, [...defaults]);
    return out;
  }
  if (/^\s*no\b/i.test(trimmed) && !trimmed.includes('{')) return out;

  let parsed: unknown;
  try {
    parsed = extractJson(trimmed);
  } catch {
    if (ids.length === 1 && /\byes\b/i.test(trimmed) && !/\bno\b/i.test(trimmed)) {
      out.set(ids[0]!, [...defaults]);
    }
    return out;
  }

  if (!parsed || typeof parsed !== 'object') return out;
  const obj = parsed as Record<string, unknown>;

  if (Array.isArray(obj['results'])) {
    for (const row of obj['results']) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const id = String(r['id'] ?? '');
      if (!out.has(id)) continue;
      out.set(id, callsFromUnknown(r['calls'] ?? r['tools'] ?? r['actions'], defaults));
    }
    return out;
  }

  if (obj['calls'] != null || obj['tools'] != null || obj['actions'] != null) {
    const calls = callsFromUnknown(
      obj['calls'] ?? obj['tools'] ?? obj['actions'],
      defaults,
    );
    const match = obj['match'];
    if (ids.length === 1) {
      if (match === false) out.set(ids[0]!, []);
      else if (calls.length) out.set(ids[0]!, calls);
      else if (match === true) out.set(ids[0]!, [...defaults]);
      else out.set(ids[0]!, calls);
    }
    return out;
  }

  if (typeof obj['match'] === 'boolean' && ids.length === 1) {
    out.set(ids[0]!, obj['match'] ? [...defaults] : []);
    return out;
  }

  for (const id of ids) {
    if (id in obj) out.set(id, callsFromUnknown(obj[id], defaults));
  }
  return out;
}

export function callsFromUnknown(
  raw: unknown,
  defaults: WorkflowAction[],
): WorkflowAction[] {
  if (raw == null) return [];
  if (typeof raw === 'string') {
    const one = normalizeFn(raw, undefined);
    return one ? [one] : [];
  }
  if (!Array.isArray(raw)) return [];
  if (raw.length === 1 && raw[0] === 'defaults') return [...defaults];
  const out: WorkflowAction[] = [];
  for (const item of raw) {
    const act = normalizeCall(item);
    if (act) out.push(act);
  }
  return out;
}

export function buildHarnessPrompt(
  wf: Workflow,
  cards: { id: string; from: string; subject: string; snippet: string }[],
  defaults: WorkflowAction[],
  hints: string[],
): { system: string; prompt: string } {
  const system = [
    'You decide per email whether it matches the user request.',
    'Mail stays on this computer. Reply with one JSON object. No markdown.',
    'If this email is not what they asked about, calls must be []. Do not archive unrelated mail.',
    'Never send, forward, or permanently delete. archive = leave the inbox (still in All Mail).',
  ].join(' ');

  const bundles = toolBundles(wf);
  const toolHint =
    bundles.length > 1
      ? bundles
          .map(
            (b, i) =>
              `${i + 1}. ` +
              b
                .map((a) =>
                  a.type === 'addLabel'
                    ? `addLabel name=${a.name || wf.name}`
                    : a.type,
                )
                .join(' + '),
          )
          .join(' | ')
      : defaults
          .map((a) =>
            a.type === 'addLabel' ? `addLabel name=${a.name || wf.name}` : a.type,
          )
          .join(', ');

  const lines = [
    'Workflow intent:',
    wf.english.trim() || wf.description || wf.name,
    '',
    'When it matches, use these tools (subset ok): ' + (toolHint || 'archive'),
    hints.length ? 'Names/phrases from the request: ' + hints.join(', ') : '',
    '',
    'Allowed fn: addLabel, archive, star, notify, report. Unrelated → {"calls":[]}.',
    '',
    'Emails:',
  ];
  for (const c of cards) {
    lines.push(
      `${c.id} | From: ${c.from} | Subject: ${c.subject} | Snippet: ${c.snippet}`,
    );
  }
  lines.push('');
  if (cards.length === 1) {
    lines.push(
      'JSON: {"calls":[{"fn":"addLabel","name":"Label"},{"fn":"archive"}]} or {"calls":[]}',
    );
  } else {
    lines.push(
      'JSON: {"results":[{"id":"' +
        cards[0]!.id +
        '","calls":[{"fn":"archive"}]}]}',
    );
  }
  return { system, prompt: lines.filter((l) => l !== undefined).join('\n') };
}

export function emailCard(target: MailTarget, alias: string): {
  id: string;
  from: string;
  subject: string;
  snippet: string;
} {
  const snippet = (target.snippet || target.bodyPreview || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 420);
  return {
    id: alias,
    from: `${target.fromName} <${target.fromEmail}>`.trim(),
    subject: (target.subject || '').slice(0, 160),
    snippet,
  };
}

export async function planBatch(
  wf: Workflow,
  targets: MailTarget[],
  defaults: WorkflowAction[],
  hints: string[],
  signal?: AbortSignal,
): Promise<Map<string, WorkflowAction[]>> {
  const aliases = targets.map((_, i) => `e${i + 1}`);
  const idByAlias = new Map(aliases.map((a, i) => [a, targets[i]!.id]));
  const cards = targets.map((t, i) => emailCard(t, aliases[i]!));
  const { system, prompt } = buildHarnessPrompt(wf, cards, defaults, hints);
  const res = await completeWithBinding(
    wf.model.backend,
    wf.model.model,
    prompt,
    system,
    signal,
  );
  const byAlias = parseHarnessResponse(res.text || '', defaults, aliases);
  const byThread = new Map<string, WorkflowAction[]>();
  for (const [alias, calls] of byAlias) {
    const tid = idByAlias.get(alias);
    if (tid) byThread.set(tid, calls);
  }
  return byThread;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no json');
  return JSON.parse(raw.slice(start, end + 1));
}

function normalizeCall(item: unknown): WorkflowAction | null {
  if (typeof item === 'string') return normalizeFn(item, undefined);
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  const fn = String(o['fn'] ?? o['type'] ?? o['name'] ?? o['tool'] ?? o['function'] ?? '');
  const name =
    typeof o['name'] === 'string' &&
    !/^(addLabel|archive|star|notify|label|report)$/i.test(o['name'])
      ? o['name']
      : typeof o['label'] === 'string'
        ? o['label']
        : typeof o['title'] === 'string'
          ? o['title']
          : typeof o['text'] === 'string'
            ? o['text']
            : undefined;
  const title = typeof o['title'] === 'string' ? o['title'] : undefined;
  const text = typeof o['text'] === 'string' ? o['text'] : undefined;
  return normalizeFn(fn, name ?? title ?? text);
}

function normalizeFn(fn: string, name?: string): WorkflowAction | null {
  const key = fn.trim().toLowerCase().replace(/[_\s-]+/g, '');
  if (!key || key === 'skip' || key === 'none' || key === 'noop' || key === 'no') {
    return null;
  }
  if (key === 'send' || key === 'forward' || key === 'reply') return null;
  if (
    key === 'archive' ||
    key === 'removefrominbox' ||
    key === 'leaveinbox' ||
    key === 'delete' ||
    key === 'trash' ||
    key === 'remove'
  ) {
    return { type: 'archive' };
  }
  if (key === 'star' || key === 'starred') return { type: 'star' };
  if (key === 'notify' || key === 'alert' || key === 'ping') {
    return { type: 'notify', title: name };
  }
  if (key === 'addlabel' || key === 'label' || key === 'file' || key === 'moveto') {
    return { type: 'addLabel', name: name?.trim() || undefined };
  }
  if (
    key === 'report' ||
    key === 'answer' ||
    key === 'brief' ||
    key === 'briefing' ||
    key === 'note'
  ) {
    return { type: 'report', text: name?.trim() || undefined };
  }
  return null;
}

function normalizeAction(a: WorkflowAction): WorkflowAction | null {
  if (!ALLOWED.has(a.type) && a.type !== 'removeFromInbox') return null;
  if (a.type === 'removeFromInbox') return { type: 'archive' };
  if (a.type === 'addLabel') return { type: 'addLabel', name: a.name };
  if (a.type === 'notify') return { type: 'notify', title: a.title };
  if (a.type === 'star') return { type: 'star' };
  if (a.type === 'report') return { type: 'report', text: a.text || a.title };
  return { type: 'archive' };
}

export async function synthesizeReport(
  wf: Workflow,
  targets: MailTarget[],
  actions: {
    action: string;
    detail?: string;
    from?: string;
    subject?: string;
  }[],
  signal?: AbortSignal,
): Promise<string> {
  const lines = targets.slice(0, 60).map((t, i) => {
    const snip = (t.snippet || t.bodyPreview || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    return `${i + 1}. ${t.fromName || t.fromEmail} — ${t.subject}${snip ? `\n   ${snip}` : ''}`;
  });
  const actLines = actions
    .filter((a) => a.action !== 'report')
    .slice(0, 40)
    .map((a) => {
      const bit = [a.action, a.detail].filter(Boolean).join(' ');
      const who = [a.from, a.subject].filter(Boolean).join(' — ');
      return `- ${bit}${who ? ': ' + who : ''}`;
    });
  const notes = actions
    .filter((a) => a.action === 'report' && a.detail)
    .map((a) => a.detail as string);
  const prompt = [
    'Answer this request from the local inbox snapshot. Mail stays on this computer.',
    '',
    'Request:',
    wf.english.trim() || wf.description || wf.name,
    '',
    'Inbox (newest first):',
    lines.join('\n') || '(empty inbox)',
    actLines.length ? '\nActions already taken:\n' + actLines.join('\n') : '',
    notes.length ? '\nNotes:\n' + notes.join('\n') : '',
    '',
    'Write a concise briefing. If they asked to prioritise, use a numbered list with who/subject and why. No JSON, no tools, no preamble.',
  ]
    .filter((l) => l !== undefined)
    .join('\n');
  const res = await completeWithBinding(
    wf.model.backend,
    wf.model.model,
    prompt,
    'You write short mail briefings. Plain text or markdown lists. Mail never leaves this computer.',
    signal,
  );
  return (res.text || '').trim();
}
