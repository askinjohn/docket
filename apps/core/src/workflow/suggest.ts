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
  const prompt = `Compile this request into ONE JSON object. Omit unused matcher fields. Do not invent extra filters. Copy names, senders, and phrases from the request — do not substitute examples of your own.

Request:
${english.trim()}

Schema (all matcher keys optional; omit any you do not need):
{
  "name": "short name",
  "description": "one sentence",
  "trigger": { "type": "mail.received" | "manual" | "cron", "expr": "5-field cron if scheduled" },
  "rules": [
    {
      "matchers": {},
      "judge": "urgent | needs_reply | noise | can_archive",
      "then": [
        { "type": "notify", "title": "optional" },
        { "type": "addLabel", "name": "Label from the request or a short derived name" },
        { "type": "archive" },
        { "type": "star" },
        { "type": "report" }
      ]
    }
  ]
}

Mechanics:
- Fields on one rule are AND. Values in one array are OR.
- If the request says "A or B", emit two rules, not one rule that ANDs A and B.
- Incoming / "when mail arrives" → mail.received. Going through existing mail / last week / latest → manual. A named clock time → cron.
- Distinctive names from the request (calendars, products, teams, bots) often appear in the body or snippet → put them in query. Sender names/domains → fromIncludes. Subject wording → subjectIncludes.
- Do not set unread, hasAttachment, or maxAgeDays unless the request said so. Many automated mails include attachments; requiring none will miss them.
- Use a judge only when the request is about meaning (urgent, needs a reply, noise, safe to archive) with no reliable sender/subject/query. If matchers already name the mail, omit judge.
- Filing away: addLabel (if they want a group) plus archive. archive and removeFromInbox are the same — use one.
- You decide the tools from the request. Want a written answer (list, priorities, summary, who to reply) → include { "type": "report" }. Want mail changed → those actions. Both is allowed. Do not guess from examples we did not mention.
- Never send, delete, forward, or trash.`;

  const system = [
    'You compile mail workflows. Output a single JSON object.',
    'Triggers: ' + TRIGGER_CATALOG.map((t) => t.id).join(', '),
    'Judges: ' + JUDGE_CATALOG.map((j) => j.id).join(', '),
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

function extractQuery(english: string): string | undefined {
  const quoted = [...english.matchAll(/["“']([^"”']{2,})["”']/g)].map((m) => m[1]!.trim());
  if (quoted.length) return quoted.join(' ');
  const stop = new Set(
    `a an the and or to of in on for from with without any all when then that this those these they them their need needs be been is are was were moved move remove removed out inbox folder folders archive archived separate email emails mail mails containing contains contain go going through latest week days properly`.split(
      /\s+/,
    ),
  );
  const tokens = english.match(/[A-Za-z][\w.-]{1,}/g) ?? [];
  const keep = tokens.filter((t) => {
    const low = t.toLowerCase();
    if (stop.has(low)) return false;
    return t.includes('-') || t.length >= 5;
  });
  const unique = [...new Set(keep.map((t) => t.toLowerCase()))];
  const expanded = unique.flatMap((t) =>
    t.includes('-') ? [t.replace(/-/g, ' ')] : [t],
  );
  return expanded.length ? expanded.slice(0, 8).join(' ') : undefined;
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
  const fallbackQuery = extractQuery(english);

  return rules.map((rule, i) => {
    const m = { ...(rule.matchers ?? {}) };
    if (!allowUnread) delete m.unread;
    if (!allowAttach) delete m.hasAttachment;
    if (!allowAge) delete m.maxAgeDays;
    m.fromIncludes = realStrings(m.fromIncludes);
    m.subjectIncludes = realStrings(m.subjectIncludes);
    m.labelIncludes = realStrings(m.labelIncludes);
    if (m.query && PLACEHOLDER.test(m.query)) delete m.query;
    if (!hasCheap(m) && fallbackQuery) m.query = fallbackQuery;
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
