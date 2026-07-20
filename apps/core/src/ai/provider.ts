import { appConfig } from '../config.js';
import { getDb, type MessageRow, type ThreadRow } from '../db/index.js';
import { getActiveAccount } from '../db/accounts.js';

export type AiMode = 'template' | 'ollama' | 'openai';

export function resolveAiMode(): AiMode {
  if (appConfig.ai.openaiApiKey) return 'openai';
  // Ollama optional — probe is async; default prefer template unless forced
  if (process.env.LOCAL_MAIL_AI_PROVIDER === 'ollama') return 'ollama';
  if (process.env.LOCAL_MAIL_AI_PROVIDER === 'openai') return 'openai';
  if (process.env.LOCAL_MAIL_AI_PROVIDER === 'template') return 'template';
  // Prefer ollama if URL set and not disabled
  if (process.env.OLLAMA_BASE_URL) return 'ollama';
  return 'template';
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
    `**Summary** (template — no LLM configured)`,
    '',
    `**Subject:** ${thread.subject || '(no subject)'}`,
    `**From:** ${thread.from_name || thread.from_email}`,
    `**Messages:** ${messages.length}`,
    '',
    '**Recent points:**',
    bullets || '- (no text body)',
    '',
    `_Account ${account.email}_`,
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

async function ollamaComplete(prompt: string): Promise<string> {
  const res = await fetch(`${appConfig.ai.ollamaBaseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: appConfig.ai.ollamaModel,
      prompt,
      stream: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { response?: string };
  return (data.response || '').trim();
}

async function openaiComplete(prompt: string): Promise<string> {
  const res = await fetch(`${appConfig.ai.openaiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${appConfig.ai.openaiApiKey}`,
    },
    body: JSON.stringify({
      model: appConfig.ai.openaiModel,
      messages: [
        {
          role: 'system',
          content: 'You help with email. Be concise and accurate.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return (data.choices?.[0]?.message?.content || '').trim();
}

export async function summarizeThread(threadId: string): Promise<{
  text: string;
  mode: AiMode;
}> {
  const mode = resolveAiMode();
  if (mode === 'template') {
    return { text: templateSummarize(threadId), mode };
  }
  const ctx = threadContext(threadId);
  const prompt = `Summarize this email thread in short bullets (max 8). Note action items.\n\n${ctx}`;
  try {
    const text =
      mode === 'openai' ? await openaiComplete(prompt) : await ollamaComplete(prompt);
    return { text, mode };
  } catch (e) {
    console.warn('[ai] LLM failed, falling back to template', e);
    return { text: templateSummarize(threadId), mode: 'template' };
  }
}

export async function draftReply(threadId: string): Promise<{
  text: string;
  mode: AiMode;
}> {
  const mode = resolveAiMode();
  if (mode === 'template') {
    return { text: templateDraft(threadId), mode };
  }
  const ctx = threadContext(threadId);
  const prompt = `Write a short, polite reply email body (no subject line) for this thread:\n\n${ctx}`;
  try {
    const text =
      mode === 'openai' ? await openaiComplete(prompt) : await ollamaComplete(prompt);
    return { text, mode };
  } catch (e) {
    console.warn('[ai] LLM failed, falling back to template', e);
    return { text: templateDraft(threadId), mode: 'template' };
  }
}
