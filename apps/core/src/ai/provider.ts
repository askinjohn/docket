import { getDb, type MessageRow, type ThreadRow } from '../db/index.js';
import { getActiveAccount } from '../db/accounts.js';
import {
  getAiConfig,
  publicAiConfig,
  resolveRole,
  resolvedApiKey,
  type AiRoleId,
} from './config.js';

export type AiMode = 'template' | 'ollama' | 'openai';

export interface AiStatus {
  mode: AiMode;
  model: string | null;
  ollamaReachable: boolean;
  ollamaBaseUrl: string;
  models: string[];
  hasChatModel: boolean;
  hint: string;
  config: ReturnType<typeof publicAiConfig>;
}

let lastStatus: AiStatus | null = null;

export function resolveAiMode(): AiMode {
  return lastStatus?.mode ?? 'ollama';
}

export function lastAiStatus(): AiStatus | null {
  return lastStatus;
}

function localOllamaUrl(): string {
  const b = getAiConfig().backends['local'];
  if (b?.type === 'ollama' && b.baseURL) return b.baseURL.replace(/\/$/, '');
  return 'http://127.0.0.1:11434';
}

export async function probeOllama(
  baseURL = localOllamaUrl(),
): Promise<{ reachable: boolean; models: string[] }> {
  try {
    const res = await fetch(`${baseURL.replace(/\/$/, '')}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { reachable: false, models: [] };
    const data = (await res.json()) as { models?: { name?: string }[] };
    const models = (data.models ?? [])
      .map((m) => m.name)
      .filter((n): n is string => Boolean(n));
    return { reachable: true, models };
  } catch {
    return { reachable: false, models: [] };
  }
}

export async function getAiStatus(): Promise<AiStatus> {
  const cfg = publicAiConfig();
  const ollamaBaseUrl = localOllamaUrl();
  const { reachable, models } = await probeOllama(ollamaBaseUrl);
  const summarize = resolveRole('summarize');
  const mode: AiMode =
    summarize.backend.type === 'template'
      ? 'template'
      : summarize.backend.type === 'openai_compatible'
        ? 'openai'
        : 'ollama';
  const hasChatModel =
    mode !== 'ollama' || models.some((m) => !m.toLowerCase().includes('embed'));
  let hint = `Roles from ${cfg.path}`;
  if (mode === 'ollama' && !reachable) {
    hint = `Ollama not running at ${ollamaBaseUrl}. Start it or switch a role to another backend in Settings.`;
  } else if (mode === 'ollama' && summarize.model) {
    hint = `summarize → ${summarize.backendName} · ${summarize.model}`;
  }
  lastStatus = {
    mode,
    model: summarize.model || null,
    ollamaReachable: reachable,
    ollamaBaseUrl,
    models,
    hasChatModel,
    hint,
    config: cfg,
  };
  return lastStatus;
}

function threadContext(threadId: string): string {
  const account = getActiveAccount();
  if (!account) throw new Error('No account');

  const thread = getDb()
    .prepare(`SELECT * FROM threads WHERE id = ? AND account_id = ?`)
    .get(threadId, account.id) as ThreadRow | undefined;
  if (!thread) throw new Error('Thread not found');

  const messages = getDb()
    .prepare(
      `SELECT * FROM messages WHERE thread_id = ? ORDER BY internal_date ASC LIMIT 12`,
    )
    .all(threadId) as MessageRow[];

  const parts = [
    `Subject: ${thread.subject}`,
    `From: ${thread.from_name} <${thread.from_email}>`,
    '',
  ];
  for (const m of messages) {
    parts.push(`--- ${m.from_header} ---`);
    parts.push((m.body_text || m.snippet || '').slice(0, 2000));
    parts.push('');
  }
  return parts.join('\n');
}

function templateSummarize(threadId: string): string {
  const account = getActiveAccount()!;
  const thread = getDb()
    .prepare(`SELECT * FROM threads WHERE id = ?`)
    .get(threadId) as ThreadRow;
  const messages = getDb()
    .prepare(
      `SELECT * FROM messages WHERE thread_id = ? ORDER BY internal_date ASC`,
    )
    .all(threadId) as MessageRow[];

  const bullets = messages
    .slice(-5)
    .map((m) => {
      const snip = (m.body_text || m.snippet || '').replace(/\s+/g, ' ').slice(0, 160);
      return `- ${m.from_header}: ${snip}`;
    })
    .join('\n');

  return [
    `**Summary** (template — Ollama not available)`,
    '',
    `**Subject:** ${thread.subject || '(no subject)'}`,
    `**From:** ${thread.from_name || thread.from_email}`,
    `**Messages:** ${messages.length}`,
    '',
    '**Recent points:**',
    bullets || '- (no text body)',
  ].join('\n');
}

function templateDraft(threadId: string): string {
  const thread = getDb()
    .prepare(`SELECT * FROM threads WHERE id = ?`)
    .get(threadId) as ThreadRow;
  const who = thread.from_name || 'there';
  return [
    `Hi ${who.split(' ')[0] || 'there'},`,
    '',
    'Thanks for your email — I wanted to follow up briefly.',
    '',
    '[Your points here]',
    '',
    'Best regards',
  ].join('\n');
}

function mergeAbort(user: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return user ? AbortSignal.any([timeout, user]) : timeout;
}

async function ollamaChat(
  baseURL: string,
  model: string,
  messages: { role: string; content: string }[],
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(`${baseURL.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
    signal: mergeAbort(signal, 180_000),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Ollama HTTP ${res.status} for ${model}. ${body}`);
  }
  const data = (await res.json()) as {
    message?: { content?: string };
    response?: string;
  };
  return (data.message?.content || data.response || '').trim();
}

async function openaiComplete(
  baseURL: string,
  apiKey: string,
  model: string,
  system: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(`${baseURL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
    }),
    signal: mergeAbort(signal, 120_000),
  });
  if (!res.ok) {
    throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return (data.choices?.[0]?.message?.content || '').trim();
}

export async function completeWithBinding(
  backendName: string,
  model: string,
  prompt: string,
  system: string,
  signal?: AbortSignal,
): Promise<{ text: string; mode: AiMode; model: string | null }> {
  const cfg = getAiConfig();
  const backend =
    cfg.backends[backendName] ??
    cfg.backends['local'] ?? {
      type: 'ollama' as const,
      baseURL: 'http://127.0.0.1:11434',
    };
  if (backend.type === 'template') {
    return { text: '', mode: 'template', model: null };
  }
  if (backend.type === 'openai_compatible') {
    const text = await openaiComplete(
      backend.baseURL,
      resolvedApiKey(backend),
      model,
      system,
      prompt,
      signal,
    );
    return { text, mode: 'openai', model };
  }
  const text = await ollamaChat(
    backend.baseURL,
    model,
    [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    signal,
  );
  return { text, mode: 'ollama', model };
}

async function complete(
  role: AiRoleId,
  prompt: string,
  system: string,
): Promise<{ text: string; mode: AiMode; model: string | null }> {
  const ep = resolveRole(role);
  return completeWithBinding(ep.backendName, ep.model, prompt, system);
}

export async function summarizeThread(threadId: string): Promise<{
  text: string;
  mode: AiMode;
  model?: string | null;
}> {
  const ctx = threadContext(threadId);
  const prompt = `Summarize this email thread in short bullets (max 8). Note action items.\n\n${ctx}`;
  const t0 = Date.now();
  console.log('[ai] summarize start', threadId);
  try {
    const result = await complete(
      'summarize',
      prompt,
      'You summarize email threads. Be concise and accurate. Output markdown only.',
    );
    if (result.mode === 'template' || !result.text) {
      console.log('[ai] summarize template fallback', Date.now() - t0, 'ms');
      return { text: templateSummarize(threadId), mode: 'template', model: null };
    }
    console.log(
      '[ai] summarize ok',
      result.mode,
      result.model,
      Date.now() - t0,
      'ms',
      result.text.length,
      'chars',
    );
    return { text: result.text, mode: result.mode, model: result.model };
  } catch (e) {
    console.warn('[ai] summarize failed', Date.now() - t0, 'ms', e);
    throw e instanceof Error ? e : new Error(String(e));
  }
}

export async function chatAboutThread(
  threadId: string,
  history: { role: 'user' | 'assistant'; content: string }[],
): Promise<{ text: string; mode: AiMode; model: string | null }> {
  const last = history.at(-1);
  if (!last || last.role !== 'user' || !last.content.trim()) {
    throw new Error('Ask a question first');
  }
  const ctx = threadContext(threadId);
  const ep = resolveRole('chat');
  const system = `You answer follow-up questions about this email thread. Be concise. Cite senders when useful. Do not invent facts that are not in the thread.\n\n${ctx}`;
  const t0 = Date.now();
  console.log('[ai] chat start', threadId, 'turns', history.length, ep.model);
  if (ep.backend.type === 'template') {
    return {
      text: 'Thread chat needs Ollama (or another backend) in ai-config.json for the “chat” role.',
      mode: 'template',
      model: null,
    };
  }
  const messages = [
    { role: 'system', content: system },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  try {
    if (ep.backend.type === 'openai_compatible') {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const key = resolvedApiKey(ep.backend);
      if (key) headers.Authorization = `Bearer ${key}`;
      const res = await fetch(
        `${ep.backend.baseURL.replace(/\/$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: ep.model,
            messages,
            temperature: 0.3,
          }),
          signal: AbortSignal.timeout(180_000),
        },
      );
      if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = (data.choices?.[0]?.message?.content || '').trim();
      console.log('[ai] chat ok openai', Date.now() - t0, 'ms');
      return { text, mode: 'openai', model: ep.model };
    }
    const text = await ollamaChat(ep.backend.baseURL, ep.model, messages);
    console.log('[ai] chat ok', ep.model, Date.now() - t0, 'ms', text.length, 'chars');
    return { text, mode: 'ollama', model: ep.model };
  } catch (e) {
    console.warn('[ai] chat failed', Date.now() - t0, 'ms', e);
    throw e instanceof Error ? e : new Error(String(e));
  }
}

export async function askMailbox(
  question: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
): Promise<{ text: string; mode: AiMode; model: string | null }> {
  const last = history.at(-1);
  const q =
    question.trim() ||
    (last?.role === 'user' ? last.content.trim() : '');
  if (!q) throw new Error('Ask a question first');

  const account = getActiveAccount();
  if (!account) throw new Error('No account');

  const threads = getDb()
    .prepare(
      `SELECT id, subject, from_name, from_email, snippet, unread
       FROM threads
       WHERE account_id = ?
         AND (label_ids LIKE '%INBOX%' OR label_ids = '[]')
       ORDER BY last_message_at DESC
       LIMIT 24`,
    )
    .all(account.id) as Array<{
    id: string;
    subject: string;
    from_name: string;
    from_email: string;
    snippet: string;
    unread: number;
  }>;

  const snapshot = threads
    .map((t, i) => {
      const who = t.from_name || t.from_email || 'Unknown';
      const flag = t.unread ? '[unread] ' : '';
      return `${i + 1}. ${flag}${who}: ${t.subject}\n   ${(t.snippet || '').slice(0, 180)}`;
    })
    .join('\n');

  const system = `You answer questions about the user's recent inbox. Use only this snapshot. If the answer is not there, say so. Be concise. Mention senders and subjects when useful.\n\nMailbox snapshot:\n${snapshot || '(empty inbox cache)'}`;

  const turns =
    history.length > 0
      ? history
      : [{ role: 'user' as const, content: q }];

  const ep = resolveRole('ask');
  const t0 = Date.now();
  console.log('[ai] ask start', 'turns', turns.length, ep.model);
  if (ep.backend.type === 'template') {
    return {
      text: 'Mailbox Ask AI needs Ollama (or another backend) in ai-config.json for the “ask” role.',
      mode: 'template',
      model: null,
    };
  }
  const messages = [
    { role: 'system', content: system },
    ...turns.map((m) => ({ role: m.role, content: m.content })),
  ];
  try {
    if (ep.backend.type === 'openai_compatible') {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      const key = resolvedApiKey(ep.backend);
      if (key) headers.Authorization = `Bearer ${key}`;
      const res = await fetch(
        `${ep.backend.baseURL.replace(/\/$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: ep.model,
            messages,
            temperature: 0.3,
          }),
          signal: AbortSignal.timeout(180_000),
        },
      );
      if (!res.ok) {
        throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = (data.choices?.[0]?.message?.content || '').trim();
      console.log('[ai] ask ok openai', Date.now() - t0, 'ms');
      return { text, mode: 'openai', model: ep.model };
    }
    const text = await ollamaChat(ep.backend.baseURL, ep.model, messages);
    console.log(
      '[ai] ask ok',
      ep.model,
      Date.now() - t0,
      'ms',
      text.length,
      'chars',
    );
    return { text, mode: 'ollama', model: ep.model };
  } catch (e) {
    console.warn('[ai] ask failed', Date.now() - t0, 'ms', e);
    throw e instanceof Error ? e : new Error(String(e));
  }
}

export async function draftReply(threadId: string): Promise<{
  text: string;
  mode: AiMode;
  model?: string | null;
}> {
  const ctx = threadContext(threadId);
  const prompt = `Write a short, polite reply email body (no subject line) for this thread:\n\n${ctx}`;
  try {
    const result = await complete(
      'draft',
      prompt,
      'You write email replies. Output only the message body — no subject line, no preamble.',
    );
    if (result.mode === 'template' || !result.text) {
      return { text: templateDraft(threadId), mode: 'template', model: null };
    }
    return { text: result.text, mode: result.mode, model: result.model };
  } catch (e) {
    console.warn('[ai] draft failed', e);
    throw e instanceof Error ? e : new Error(String(e));
  }
}
