import { completeWithBinding } from '../ai/provider.js';
import {
  ACTION_CATALOG,
  JUDGE_CATALOG,
  TRIGGER_CATALOG,
  newId,
  parseRule,
  parseTrigger,
  type Workflow,
  type WorkflowAction,
  type WorkflowModel,
  type WorkflowRule,
} from './catalog.js';


function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('Model did not return JSON');
  return JSON.parse(raw.slice(start, end + 1));
}

export async function suggestWorkflow(
  english: string,
  model: WorkflowModel,
): Promise<Workflow> {
  const prompt = `Compile this request into ONE JSON object. The JSON is a tool allowlist + schedule. At run time the same model reads each inbox thread and decides. Do not invent keyword AND filters.

Request:
${english.trim()}

Schema:
{
  "name": "short name",
  "description": "one sentence",
  "trigger": { "type": "mail.received" | "manual" | "cron", "expr": "5-field cron if scheduled" },
  "rules": [
    {
      "matchers": {},
      "then": [
        { "type": "notify", "title": "optional" },
        { "type": "addLabel", "name": "Label from the request" },
        { "type": "archive" },
        { "type": "star" },
        { "type": "report" }
      ]
    }
  ]
}

Mechanics:
- Incoming / when mail arrives → mail.received. Existing mail / last week / latest / run now → manual. A clock time → cron.
- then[] is the allowlist the runner may call. Filing: addLabel (if they want a group) plus archive. Written answer / priorities / list → report. Both is allowed.
- matchers are optional HINTS only (a sender they named, one phrase). Omit matchers if unsure. Never bag-of-words AND. Never unread/hasAttachment/maxAgeDays unless they said so.
- Omit judge unless they asked for meaning-only (urgent / needs reply) with no names.
- Never send, delete, forward, or trash. archive = leave inbox (mail stays in All Mail).`;

  const system = [
    'You compile mail workflow JSON. Matching is done later by the model per email.',
    'Triggers: ' + TRIGGER_CATALOG.map((t) => t.id).join(', '),
    'Actions: ' + ACTION_CATALOG.map((a) => a.id).join(', '),
  ].join('\n');

  const res = await completeWithBinding(
    model.backend,
    model.model,
    prompt,
    system,
  );
  if (!res.text) {
    throw new Error('Model returned no plan — check the backend/model.');
  }
  const parsed = extractJson(res.text) as Record<string, unknown>;
  const rulesRaw = Array.isArray(parsed['rules']) ? parsed['rules'] : [];
  let rules = sanitizeRules(
    english,
    rulesRaw
      .map((r, i) => parseRule(r, `r${i + 1}`))
      .filter((r): r is WorkflowRule => Boolean(r)),
  );
  if (!rules.length) {
    rules = [{ id: 'r1', then: [] }];
  }
  const now = new Date().toISOString();
  return {
    id: newId('wf'),
    name:
      typeof parsed['name'] === 'string' && parsed['name'].trim()
        ? parsed['name'].trim()
        : 'Suggested workflow',
    description:
      typeof parsed['description'] === 'string' ? parsed['description'] : '',
    english: english.trim(),
    enabled: false,
    approved: false,
    trigger: parseTrigger(parsed['trigger']),
    model,
    rules,
    createdAt: now,
    updatedAt: now,
    lastRunAt: null,
    lastError: null,
  };
}

const PLACEHOLDER =
  /from the request|optional |if named|short name|substring|existing label|may appear/i;

function realStrings(values: string[] | undefined): string[] | undefined {
  const out = (values ?? []).map((s) => s.trim()).filter((s) => s && !PLACEHOLDER.test(s));
  return out.length ? out : undefined;
}

/** One phrase the user named — not a bag of leftover English words. */
function extractHintPhrase(english: string): string | undefined {
  const quoted = [...english.matchAll(/["“']([^"”']{2,})["”']/g)].map((m) =>
    m[1]!.trim(),
  );
  if (quoted[0]) return quoted[0];
  const hyphen = english.match(/[A-Za-z][\w]*-[\w-]+/);
  return hyphen?.[0];
}

function hasCheap(m: NonNullable<WorkflowRule['matchers']> | undefined): boolean {
  if (!m) return false;
  return Boolean(
    m.fromIncludes?.length ||
      m.subjectIncludes?.length ||
      m.query ||
      m.labelIncludes?.length,
  );
}

/** Strip filters small models copy from the schema even when the user did not ask. */
export function sanitizeRules(
  english: string,
  rules: WorkflowRule[],
): WorkflowRule[] {
  const text = english.toLowerCase();
  const allowUnread = /\bunread\b|\bonly new\b/.test(text);
  const allowAttach = /\battachment\b|\bics\b|\bwith file/.test(text);
  const allowAge =
    /\blast week\b|\bpast \d+ days\b|\blast \d+ days\b|\brecent\b|\blatest\b/.test(
      text,
    );
  const allowNotify = /\bnotif|\balert\b|\bping\b|\bbanner\b/.test(text);
  const allowStar = /\bstar\b/.test(text);
  const hint = extractHintPhrase(english);

  return rules.map((rule, i) => {
    const m = { ...(rule.matchers ?? {}) };
    if (!allowUnread) delete m.unread;
    if (!allowAttach) delete m.hasAttachment;
    if (!allowAge) delete m.maxAgeDays;
    m.fromIncludes = realStrings(m.fromIncludes);
    m.subjectIncludes = realStrings(m.subjectIncludes);
    m.labelIncludes = realStrings(m.labelIncludes);
    if (m.query && PLACEHOLDER.test(m.query)) {
      if (hint) m.query = hint;
      else delete m.query;
    }
    const cheap = hasCheap(m);
    const judge = cheap ? undefined : rule.judge;
    let then = dedupeArchive(rule.then);
    if (!allowNotify) then = then.filter((a) => a.type !== 'notify');
    if (!allowStar) then = then.filter((a) => a.type !== 'star');
    if (!then.length) then = [];
    const matchers = Object.fromEntries(
      Object.entries(m).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)),
    );
    return {
      ...rule,
      id: rule.id || `r${i + 1}`,
      matchers: Object.keys(matchers).length ? matchers : undefined,
      judge,
      then,
    };
  });
}

function dedupeArchive(then: WorkflowAction[]): WorkflowAction[] {
  const seen = new Set<string>();
  const out: WorkflowAction[] = [];
  for (const a of then) {
    const key =
      a.type === 'removeFromInbox' || a.type === 'archive'
        ? 'archive'
        : `${a.type}:${a.name ?? a.title ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a.type === 'removeFromInbox' ? { ...a, type: 'archive' } : a);
  }
  return out;
}
