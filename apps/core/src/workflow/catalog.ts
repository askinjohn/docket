/** Closed vocabulary — English can only compose these parts. */

export type TriggerType = 'mail.received' | 'manual' | 'cron';

export type JudgeId = 'urgent' | 'needs_reply' | 'noise' | 'can_archive';

export type ActionType =
  | 'notify'
  | 'addLabel'
  | 'removeFromInbox'
  | 'archive'
  | 'star'
  | 'report';

export interface WorkflowTrigger {
  type: TriggerType;
  /** 5-field cron when type === cron (minute hour dom month dow). */
  expr?: string;
}

export interface WorkflowMatcher {
  fromIncludes?: string[];
  subjectIncludes?: string[];
  query?: string;
  hasAttachment?: boolean;
  unread?: boolean;
  labelIncludes?: string[];
  /** Only threads newer than this many days (local time). */
  maxAgeDays?: number;
}

export interface WorkflowAction {
  type: ActionType;
  /** Label display name for addLabel. */
  name?: string;
  /** Optional notify title. */
  title?: string;
  /** Briefing text for report. */
  text?: string;
}

export interface WorkflowRule {
  id: string;
  matchers?: WorkflowMatcher;
  judge?: JudgeId;
  then: WorkflowAction[];
}

export interface WorkflowModel {
  backend: string;
  model: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  english: string;
  enabled: boolean;
  approved: boolean;
  trigger: WorkflowTrigger;
  model: WorkflowModel;
  rules: WorkflowRule[];
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string | null;
  lastError?: string | null;
}

export const TRIGGER_CATALOG: {
  id: TriggerType;
  label: string;
  help: string;
}[] = [
  {
    id: 'mail.received',
    label: 'Each new mail',
    help: 'Runs when background sync sees a new inbox thread.',
  },
  {
    id: 'manual',
    label: 'When I run it',
    help: '⌘K / Workflows → Run now.',
  },
  {
    id: 'cron',
    label: 'On a schedule',
    help: '5-field cron in local time, e.g. 0 8 * * 1-5 weekdays at 08:00.',
  },
];

export const JUDGE_CATALOG: {
  id: JudgeId;
  label: string;
  help: string;
}[] = [
  {
    id: 'urgent',
    label: 'Urgent',
    help: 'Needs a prompt human look — customer, outage, deadline, ask from a person.',
  },
  {
    id: 'needs_reply',
    label: 'Needs reply',
    help: 'Someone is waiting on an answer from you.',
  },
  {
    id: 'noise',
    label: 'File away',
    help: 'Bots, CI, newsletters, leave/calendar chatter — not Primary triage.',
  },
  {
    id: 'can_archive',
    label: 'Can archive',
    help: 'Safe to leave the inbox; no action needed.',
  },
];

export const ACTION_CATALOG: {
  id: ActionType;
  label: string;
  help: string;
}[] = [
  { id: 'notify', label: 'Notify', help: 'macOS banner.' },
  { id: 'addLabel', label: 'Add label', help: 'Creates the Gmail label if needed.' },
  {
    id: 'removeFromInbox',
    label: 'Leave inbox',
    help: 'Removes INBOX (same as archive).',
  },
  { id: 'archive', label: 'Archive', help: 'Alias of leave inbox.' },
  { id: 'star', label: 'Star', help: 'Adds STARRED.' },
  {
    id: 'report',
    label: 'Answer',
    help: 'Write a briefing (priorities, lists) and show it in the right pane.',
  },
];

export const BLOCKED_ACTIONS = ['send', 'delete', 'forward', 'trash'] as const;

export function publicCatalog() {
  return {
    triggers: TRIGGER_CATALOG,
    judges: JUDGE_CATALOG,
    actions: ACTION_CATALOG,
    blocked: BLOCKED_ACTIONS,
  };
}

function asStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
  return out.length ? out : undefined;
}

export function parseMatcher(raw: unknown): WorkflowMatcher | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const m: WorkflowMatcher = {};
  const fromIncludes = asStringArray(o['fromIncludes']);
  const subjectIncludes = asStringArray(o['subjectIncludes']);
  const labelIncludes = asStringArray(o['labelIncludes']);
  if (fromIncludes) m.fromIncludes = fromIncludes;
  if (subjectIncludes) m.subjectIncludes = subjectIncludes;
  if (labelIncludes) m.labelIncludes = labelIncludes;
  if (typeof o['query'] === 'string' && o['query'].trim()) {
    m.query = o['query'].trim();
  }
  if (typeof o['hasAttachment'] === 'boolean') m.hasAttachment = o['hasAttachment'];
  if (typeof o['unread'] === 'boolean') m.unread = o['unread'];
  if (typeof o['maxAgeDays'] === 'number' && Number.isFinite(o['maxAgeDays'])) {
    const n = Math.max(1, Math.round(o['maxAgeDays']));
    m.maxAgeDays = n;
  }
  if (typeof o['maxAgeDays'] === 'string' && /^\d+$/.test(o['maxAgeDays'].trim())) {
    m.maxAgeDays = Math.max(1, Number(o['maxAgeDays'].trim()));
  }
  return Object.keys(m).length ? m : undefined;
}

const ACTION_IDS = new Set<ActionType>([
  'notify',
  'addLabel',
  'removeFromInbox',
  'archive',
  'star',
  'report',
]);

const JUDGE_IDS = new Set<JudgeId>([
  'urgent',
  'needs_reply',
  'noise',
  'can_archive',
]);

export function parseAction(raw: unknown): WorkflowAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const type = o['type'];
  if (typeof type !== 'string' || !ACTION_IDS.has(type as ActionType)) {
    return null;
  }
  const action: WorkflowAction = { type: type as ActionType };
  if (typeof o['name'] === 'string' && o['name'].trim()) {
    action.name = o['name'].trim();
  }
  if (typeof o['title'] === 'string' && o['title'].trim()) {
    action.title = o['title'].trim();
  }
  if (typeof o['text'] === 'string' && o['text'].trim()) {
    action.text = o['text'].trim();
  }
  if (action.type === 'addLabel' && !action.name) action.name = 'Filed';
  return action;
}

export function parseRule(raw: unknown, fallbackId: string): WorkflowRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const thenRaw = Array.isArray(o['then']) ? o['then'] : [];
  const then = thenRaw
    .map((a) => parseAction(a))
    .filter((a): a is WorkflowAction => Boolean(a));
  const judge =
    typeof o['judge'] === 'string' && JUDGE_IDS.has(o['judge'] as JudgeId)
      ? (o['judge'] as JudgeId)
      : undefined;
  const id =
    typeof o['id'] === 'string' && o['id'].trim() ? o['id'].trim() : fallbackId;
  return {
    id,
    matchers: parseMatcher(o['matchers'] ?? o['ifMatchers']),
    judge,
    then,
  };
}

export function parseTrigger(raw: unknown): WorkflowTrigger {
  if (!raw || typeof raw !== 'object') return { type: 'manual' };
  const o = raw as Record<string, unknown>;
  const type = o['type'];
  if (type === 'mail.received' || type === 'manual' || type === 'cron') {
    const expr =
      typeof o['expr'] === 'string' && o['expr'].trim()
        ? o['expr'].trim()
        : type === 'cron'
          ? '0 8 * * 1-5'
          : undefined;
    return type === 'cron' ? { type, expr } : { type };
  }
  return { type: 'manual' };
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
