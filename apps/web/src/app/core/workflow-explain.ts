import type {
  Workflow,
  WorkflowAction,
  WorkflowJudge,
  WorkflowRule,
} from './mail-api.service';

export type RuleExplain = {
  n: number;
  heading: string;
  matchLines: string[];
  matchEmpty: string;
  judgeLine: string | null;
  judgeHelp: string | null;
  actionLines: string[];
  warnings: string[];
};

export type WorkflowExplain = {
  whenTitle: string;
  whenBody: string;
  modelLine: string;
  modelNote: string;
  logicNote: string;
  rules: RuleExplain[];
  warnings: string[];
};

export const CONFIG_FIELD_HELP: { key: string; meaning: string }[] = [
  {
    key: 'name / description',
    meaning: 'Title and one-line summary in the list. Does not change matching.',
  },
  {
    key: 'trigger.type',
    meaning:
      'mail.received = each new inbox thread. cron = on a schedule. manual = only when you tap Run now.',
  },
  {
    key: 'trigger.expr',
    meaning:
      '5-field cron in local time, only if type is cron. Example: 0 8 * * 1-5 = weekdays at 08:00.',
  },
  {
    key: 'model',
    meaning:
      'On Run now, this local backend/model sees each inbox thread (from, subject, snippet) and returns function calls. Core executes them. Mail is not uploaded unless you picked a cloud backend.',
  },
  {
    key: 'rules',
    meaning:
      'Preferred tool bundles and optional hints. They do not gate the run — the model decides per email. Useful as examples (label names, archive vs star).',
  },
  {
    key: 'rules[].matchers',
    meaning:
      'Optional hints (a sender or one phrase). They do not gate the run — the model still reads each mail.',
  },
  {
    key: 'fromIncludes[]',
    meaning: 'Sender contains any of these strings (OR).',
  },
  {
    key: 'subjectIncludes[]',
    meaning: 'Subject contains any of these strings (OR).',
  },
  {
    key: 'query',
    meaning:
      'One phrase to look for. Prefer a single token (Team-Offsite), not a bag of words.',
  },
  {
    key: 'unread / hasAttachment / maxAgeDays / labelIncludes',
    meaning:
      'Optional extra filters. Leave them out unless you asked for them — they silently drop mail.',
  },
  {
    key: 'rules[].judge',
    meaning:
      'Optional hint (urgent | needs_reply | noise | can_archive). The model still decides per email.',
  },
  {
    key: 'rules[].then[]',
    meaning:
      'Tools: notify, addLabel, archive, star, report (write an answer in the right pane). No send or delete.',
  },
];

const JUDGE_HELP: Record<WorkflowJudge, string> = {
  urgent: 'Needs a prompt human look — customer, outage, deadline, a person asking.',
  needs_reply: 'Someone is waiting on an answer from you.',
  noise: 'Bots, CI, newsletters, leave/calendar chatter — file away from Primary.',
  can_archive: 'Safe to leave the inbox; no action needed.',
};

export function configJson(wf: Workflow): string {
  return JSON.stringify(
    {
      name: wf.name,
      description: wf.description,
      trigger: wf.trigger,
      model: wf.model,
      rules: wf.rules,
    },
    null,
    2,
  );
}

export function parseConfig(raw: string, base: Workflow): Workflow | null {
  try {
    const parsed = JSON.parse(raw) as Partial<Workflow>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return {
      ...base,
      name: typeof parsed.name === 'string' ? parsed.name : base.name,
      description:
        typeof parsed.description === 'string' ? parsed.description : base.description,
      trigger: parsed.trigger ?? base.trigger,
      model: parsed.model ?? base.model,
      rules: Array.isArray(parsed.rules) ? parsed.rules : base.rules,
    };
  } catch {
    return null;
  }
}

export function parseErrorMessage(raw: string): string | null {
  try {
    JSON.parse(raw);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Invalid JSON';
  }
}

export function explainWorkflow(wf: Workflow): WorkflowExplain {
  const warnings: string[] = [];
  if (wf.trigger.type === 'cron' && !wf.trigger.expr?.trim()) {
    warnings.push('Cron trigger is missing trigger.expr (5-field schedule).');
  }
  if ((wf.model?.backend || 'local') !== 'local') {
    warnings.push(
      'This backend is not local — from/subject/snippet will be sent to that API. Switch to local to keep mail on this machine.',
    );
  }

  return {
    whenTitle: whenTitle(wf),
    whenBody: whenBody(wf),
    modelLine: wf.model?.model
      ? `${wf.model.backend || 'local'} / ${wf.model.model}`
      : 'No model set',
    modelNote:
      'On run, this model reads from/subject/snippet of each inbox thread and returns tools from the approved list. Filing (label/archive/star) is never turned into a briefing. Mail stays on this computer when the backend is local.',
    logicNote:
      'The model is the matcher. JSON then[] is the allowlist (label names, archive vs star). Hints only sort likely mail first. delete/trash maps to archive.',
    rules: (wf.rules ?? []).map((rule, i) => explainRule(rule, i + 1)),
    warnings,
  };
}

function whenTitle(wf: Workflow): string {
  if (wf.trigger.type === 'mail.received') return 'Each new mail';
  if (wf.trigger.type === 'cron') return 'On a schedule';
  return 'Only when you run it';
}

function whenBody(wf: Workflow): string {
  if (wf.trigger.type === 'mail.received') {
    return 'Runs automatically when sync sees a new inbox thread. Dry run / Run now still work.';
  }
  if (wf.trigger.type === 'cron') {
    return (
      'Runs on a schedule in local time: ' +
      (wf.trigger.expr?.trim() || '(missing cron expression)') +
      '. You can still tap Run now.'
    );
  }
  return 'Does not run on new mail. Use Dry run or Run now from this page.';
}

function explainRule(rule: WorkflowRule, n: number): RuleExplain {
  const m = rule.matchers;
  const matchLines: string[] = [];
  const warnings: string[] = [];

  if (m?.fromIncludes?.length) {
    matchLines.push(
      'Sender contains any of ' + quoteList(m.fromIncludes) + ' (OR).',
    );
  }
  if (m?.subjectIncludes?.length) {
    matchLines.push(
      'Subject contains any of ' + quoteList(m.subjectIncludes) + ' (OR).',
    );
  }
  if (m?.query?.trim()) {
    matchLines.push(
      'Look for the phrase ' + quoteList([m.query.trim()]) + ' (hint, not a hard filter).',
    );
  }
  if (m?.labelIncludes?.length) {
    matchLines.push(
      'Already has a Gmail label matching ' + quoteList(m.labelIncludes) + '.',
    );
  }
  if (m?.unread === true) {
    matchLines.push('It is unread.');
    warnings.push(
      'unread: true skips read mail. Delete that field unless you really want unread-only.',
    );
  }
  if (m?.unread === false) matchLines.push('It is already read.');
  if (m?.hasAttachment === true) matchLines.push('It has an attachment.');
  if (m?.hasAttachment === false) {
    matchLines.push('It has no attachment.');
    warnings.push(
      'hasAttachment: false drops mail with files (invites, PDFs). Delete that field unless you asked for it.',
    );
  }
  if (m?.maxAgeDays) {
    matchLines.push('It is from the last ' + m.maxAgeDays + ' days.');
  }

  for (const s of [
    ...(m?.fromIncludes ?? []),
    ...(m?.subjectIncludes ?? []),
    m?.query ?? '',
  ]) {
    if (/placeholder|example\.com|changeme|todo/i.test(s)) {
      warnings.push(
        'Looks like a schema leftover (“' +
          s +
          '”). Replace it with a real word from your mail.',
      );
    }
  }

  const judge = rule.judge ?? null;
  let judgeLine: string | null = null;
  let judgeHelp: string | null = null;
  if (judge) {
    judgeLine =
      'Hint: treat matching mail as “' + judge.replace('_', ' ') + '”.';
    judgeHelp = JUDGE_HELP[judge] ?? null;
  }

  const actions = rule.then ?? [];
  const actionLines = actions.map(explainAction);
  if (!actions.length) {
    warnings.push('No actions in then[] — a match would do nothing.');
  }
  for (const a of actions) {
    if (a.type === 'addLabel' && !a.name?.trim()) {
      warnings.push('addLabel is missing name (the Gmail label to create/apply).');
    }
  }

  return {
    n,
    heading: 'Rule ' + n,
    matchLines,
    matchEmpty:
      'None. The model reads each mail and decides. That is expected.',
    judgeLine,
    judgeHelp,
    actionLines,
    warnings,
  };
}

function explainAction(a: WorkflowAction): string {
  if (a.type === 'addLabel') {
    return 'Add Gmail label “' + (a.name?.trim() || '(missing name)') + '”.';
  }
  if (a.type === 'archive' || a.type === 'removeFromInbox') {
    return 'Remove it from the inbox (archive). The thread stays in All Mail / that label.';
  }
  if (a.type === 'star') return 'Star it.';
  if (a.type === 'notify') {
    return 'Notify you' + (a.title ? ' (“' + a.title + '”)' : '') + '.';
  }
  if (a.type === 'report') {
    return 'Write an answer and open it in the right pane when the run finishes.';
  }
  return a.type;
}

function quoteList(items: string[]): string {
  return items.map((s) => '“' + s + '”').join(', ');
}
