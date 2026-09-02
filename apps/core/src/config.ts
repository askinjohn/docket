import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadEnv } from 'dotenv';

// Always load apps/core/.env even when process cwd is the monorepo root or Tauri
const coreRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: join(coreRoot, '.env') });
loadEnv(); // optional cwd .env as override

/** Prefer DOCKET_*; accept LOCAL_MAIL_* from existing .env files. */
export function env(suffix: string): string | undefined {
  const docket = process.env[`DOCKET_${suffix}`];
  if (docket) return docket;
  const legacy = process.env[`LOCAL_MAIL_${suffix}`];
  if (legacy) return legacy;
  return undefined;
}

function resolveDataDir(): string {
  const explicit = env('DATA_DIR');
  if (explicit) return explicit;
  const next = join(homedir(), '.docket');
  const prev = join(homedir(), '.local-mail');
  if (existsSync(next)) return next;
  if (existsSync(prev)) return prev;
  return next;
}

const host = env('CORE_HOST') ?? '127.0.0.1';
if (host !== '127.0.0.1' && host !== 'localhost') {
  console.warn(
    `[config] WARNING: binding host is "${host}". Prefer 127.0.0.1 for local-only security.`,
  );
}

const dataDir = resolveDataDir();

const notesDir = env('NOTES_DIR') ?? join(dataDir, 'notes');

mkdirSync(dataDir, { recursive: true });
mkdirSync(notesDir, { recursive: true });

function parseTokenStore(
  raw: string | undefined,
): 'sqlite' | 'keychain' {
  const v = (raw ?? 'sqlite').trim().toLowerCase();
  if (v === 'keychain' || v === 'keytar' || v === 'os') return 'keychain';
  if (v === 'sqlite' || v === 'db' || v === 'plaintext') return 'sqlite';
  console.warn(
    `[config] Unknown DOCKET_TOKEN_STORE="${raw}" — using sqlite. Valid: sqlite | keychain`,
  );
  return 'sqlite';
}

const port = Number(env('CORE_PORT') ?? 8787);

export const appConfig = {
  host,
  port,
  dataDir,
  notesDir,
  dbPath: env('DB_PATH') ?? join(dataDir, 'mail.sqlite'),
  /**
   * Where OAuth access/refresh tokens live.
   * - sqlite (default): columns on accounts — simple clone-and-run
   * - keychain: OS secret store via keytar (recommended for daily use)
   */
  tokenStore: parseTokenStore(env('TOKEN_STORE')),
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    /** Loopback redirect for desktop/local apps */
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ??
      `http://127.0.0.1:${port}/auth/gmail/callback`,
    scopes: [
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
      'openid',
    ],
  },
  /** Where the browser UI lives (for CORS + post-auth redirect) */
  webOrigin: env('WEB_ORIGIN') ?? 'http://127.0.0.1:4300',
  /**
   * Core-owned inbox poll so new-mail OS notifications work with no UI.
   * Set DOCKET_BG_SYNC_MS=0 to disable.
   */
  bgSyncIntervalMs: Number(env('BG_SYNC_MS') ?? 30_000),
  /** macOS Notification Center via osascript (independent of the Dock window). */
  osNotify: env('OS_NOTIFY') !== '0',
  ai: {
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434',
    /** Empty = auto-pick from `ollama tags` (Grist order: qwen2.5:7b, gemma2:2b, …). */
    ollamaModel: process.env.OLLAMA_MODEL ?? '',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    openaiBaseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  },
} as const;

export function googleConfigured(): boolean {
  return Boolean(appConfig.google.clientId && appConfig.google.clientSecret);
}
