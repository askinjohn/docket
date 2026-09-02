import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { appConfig, env } from '../config.js';

export type AiBackendType = 'ollama' | 'openai_compatible' | 'template';

export type AiRoleId =
  | 'summarize'
  | 'draft'
  | 'dailySummary'
  | 'chat'
  | 'ask';

export interface AiBackendConfig {
  type: AiBackendType;
  baseURL: string;
  apiKey?: string | null;
  apiKeyEnv?: string | null;
}

export interface AiRoleConfig {
  backend: string;
  model: string;
}

export interface AiConfigFile {
  version: number;
  backends: Record<string, AiBackendConfig>;
  roles: Record<string, AiRoleConfig>;
}

export const AI_ROLES: {
  id: AiRoleId;
  label: string;
  help: string;
}[] = [
  {
    id: 'summarize',
    label: 'Summarize thread',
    help: 'Reading pane · Summarize',
  },
  {
    id: 'draft',
    label: 'Draft reply',
    help: 'Reading pane · AI draft',
  },
  {
    id: 'dailySummary',
    label: 'Daily summary',
    help: 'Sidebar daily notes (when AI-backed)',
  },
  {
    id: 'chat',
    label: 'Thread chat',
    help: 'Follow-up questions in the right-hand panel',
  },
  {
    id: 'ask',
    label: 'Mailbox Ask AI',
    help: 'Mail layout rail — questions across recent inbox',
  },
];

export const CURRENT_VERSION = 1;

export function defaultAiConfig(): AiConfigFile {
  const ollamaUrl = (
    process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434'
  ).replace(/\/$/, '');
  const openaiUrl = (
    process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'
  ).replace(/\/$/, '');
  const envModel = (process.env.OLLAMA_MODEL ?? '').trim();
  const model = envModel || 'qwen2.5:7b';
  return {
    version: CURRENT_VERSION,
    backends: {
      local: {
        type: 'ollama',
        baseURL: ollamaUrl,
      },
      openai: {
        type: 'openai_compatible',
        baseURL: openaiUrl,
        apiKeyEnv: 'OPENAI_API_KEY',
      },
    },
    roles: {
      summarize: { backend: 'local', model },
      draft: { backend: 'local', model: envModel || 'gemma2:2b' },
      dailySummary: { backend: 'local', model: envModel || 'gemma2:2b' },
      chat: { backend: 'local', model },
      ask: { backend: 'local', model },
    },
  };
}

export function aiConfigPath(): string {
  return (
    env('AI_CONFIG') ?? join(appConfig.dataDir, 'ai-config.json')
  );
}

function mergeMissingDefaults(file: AiConfigFile): AiConfigFile {
  const d = defaultAiConfig();
  const backends = { ...d.backends, ...file.backends };
  const roles = { ...d.roles, ...file.roles };
  return { version: CURRENT_VERSION, backends, roles };
}

function migrateFromEnv(): AiConfigFile {
  const file = defaultAiConfig();
  const forced = (env('AI_PROVIDER') ?? '').trim().toLowerCase();
  if (forced === 'openai') {
    const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
    for (const id of Object.keys(file.roles)) {
      file.roles[id] = { backend: 'openai', model };
    }
  }
  if (forced === 'template') {
    file.backends['none'] = { type: 'template', baseURL: '' };
    for (const id of Object.keys(file.roles)) {
      file.roles[id] = { backend: 'none', model: '' };
    }
  }
  return file;
}

export function loadAiConfig(): AiConfigFile {
  const path = aiConfigPath();
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as AiConfigFile;
      return mergeMissingDefaults(parsed);
    } catch (e) {
      console.warn('[ai-config] failed to read, using defaults', e);
    }
  }
  const migrated = migrateFromEnv();
  saveAiConfig(migrated);
  return migrated;
}

export function saveAiConfig(file: AiConfigFile): AiConfigFile {
  const next = mergeMissingDefaults(file);
  const path = aiConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  cached = next;
  return next;
}

let cached: AiConfigFile | null = null;

export function getAiConfig(): AiConfigFile {
  if (!cached) cached = loadAiConfig();
  return cached;
}

export function reloadAiConfig(): AiConfigFile {
  cached = loadAiConfig();
  return cached;
}

export interface ResolvedAiEndpoint {
  role: AiRoleId;
  backendName: string;
  backend: AiBackendConfig;
  model: string;
}

export function resolveRole(role: AiRoleId): ResolvedAiEndpoint {
  const cfg = getAiConfig();
  const binding =
    cfg.roles[role] ?? defaultAiConfig().roles[role] ?? {
      backend: 'local',
      model: 'gemma2:2b',
    };
  const backend =
    cfg.backends[binding.backend] ??
    cfg.backends['local'] ?? {
      type: 'ollama' as const,
      baseURL: 'http://127.0.0.1:11434',
    };
  return {
    role,
    backendName: binding.backend,
    backend,
    model: binding.model,
  };
}

export function resolvedApiKey(backend: AiBackendConfig): string {
  if (backend.apiKey?.trim()) return backend.apiKey.trim();
  if (backend.apiKeyEnv?.trim()) {
    return process.env[backend.apiKeyEnv.trim()] ?? '';
  }
  return '';
}

/** Public view — never send stored API keys to the browser. */
export function publicAiConfig(file: AiConfigFile = getAiConfig()) {
  const backends: Record<string, AiBackendConfig & { hasKey?: boolean }> = {};
  for (const [name, b] of Object.entries(file.backends)) {
    backends[name] = {
      type: b.type,
      baseURL: b.baseURL,
      apiKey: null,
      apiKeyEnv: b.apiKeyEnv ?? null,
      hasKey: Boolean(resolvedApiKey(b)),
    };
  }
  return {
    version: file.version,
    backends,
    roles: file.roles,
    path: aiConfigPath(),
    roleMeta: AI_ROLES,
  };
}
