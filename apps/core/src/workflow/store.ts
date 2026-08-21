import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { appConfig } from '../config.js';
import {
  newId,
  parseRule,
  parseTrigger,
  type Workflow,
  type WorkflowModel,
} from './catalog.js';

export interface WorkflowFile {
  version: number;
  workflows: Workflow[];
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  at: string;
  reason: 'mail.received' | 'manual' | 'cron' | 'dry-run';
  dryRun: boolean;
  threadCount: number;
  actions: {
    threadId: string;
    action: string;
    detail?: string;
    from?: string;
    subject?: string;
  }[];
  error?: string;
  output?: string;
}

export type WorkflowJobStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'error'
  | 'cancelled';

export interface WorkflowJob {
  id: string;
  workflowId: string;
  workflowName: string;
  reason: WorkflowRun['reason'];
  dryRun: boolean;
  status: WorkflowJobStatus;
  threadCount: number;
  scanned: number;
  actions: WorkflowRun['actions'];
  current?: { from: string; subject: string } | null;
  error?: string;
  startedAt: string;
  finishedAt?: string | null;
  threadId?: string;
  limit?: number;
  output?: string;
}

const RUNS_CAP = 40;

export function workflowsPath(): string {
  return (
    process.env.LOCAL_MAIL_WORKFLOWS ??
    join(appConfig.dataDir, 'workflows.json')
  );
}

function emptyFile(): WorkflowFile {
  return { version: 1, workflows: [] };
}

let cached: WorkflowFile | null = null;
let runs: WorkflowRun[] = [];

export function loadWorkflows(): WorkflowFile {
  if (cached) return cached;
  const path = workflowsPath();
  if (!existsSync(path)) {
    cached = emptyFile();
    return cached;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as WorkflowFile & {
      runs?: WorkflowRun[];
    };
    cached = {
      version: 1,
      workflows: Array.isArray(parsed.workflows) ? parsed.workflows : [],
    };
    runs = Array.isArray(parsed.runs) ? parsed.runs.slice(0, RUNS_CAP) : [];
    return cached;
  } catch (e) {
    console.warn('[workflows] failed to read, starting empty', e);
    cached = emptyFile();
    return cached;
  }
}

function persist(): void {
  const file = loadWorkflows();
  const path = workflowsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify({ ...file, runs }, null, 2)}\n`,
    'utf8',
  );
}

export function listWorkflows(): Workflow[] {
  return loadWorkflows().workflows;
}

export function getWorkflow(id: string): Workflow | undefined {
  return listWorkflows().find((w) => w.id === id);
}

export function listRuns(): WorkflowRun[] {
  loadWorkflows();
  return runs;
}

export function recordRun(run: WorkflowRun): void {
  loadWorkflows();
  runs = [run, ...runs].slice(0, RUNS_CAP);
  persist();
}

function defaultModel(): WorkflowModel {
  return { backend: 'local', model: process.env.OLLAMA_MODEL || 'qwen2.5:7b' };
}

export function upsertWorkflow(input: Partial<Workflow> & { english?: string }): Workflow {
  const file = loadWorkflows();
  const now = new Date().toISOString();
  const existing = input.id
    ? file.workflows.find((w) => w.id === input.id)
    : undefined;
  const rules = Array.isArray(input.rules)
    ? input.rules
        .map((r, i) => parseRule(r, `r${i + 1}`))
        .filter((r): r is NonNullable<typeof r> => Boolean(r))
    : existing?.rules ?? [];
  const next: Workflow = {
    id: existing?.id ?? input.id ?? newId('wf'),
    name: (input.name || existing?.name || 'Untitled workflow').trim(),
    description: (input.description ?? existing?.description ?? '').trim(),
    english: (input.english ?? existing?.english ?? '').trim(),
    enabled: input.enabled ?? existing?.enabled ?? false,
    approved: input.approved ?? existing?.approved ?? false,
    trigger: input.trigger
      ? parseTrigger(input.trigger)
      : (existing?.trigger ?? { type: 'manual' }),
    model: {
      backend: input.model?.backend || existing?.model.backend || defaultModel().backend,
      model: input.model?.model || existing?.model.model || defaultModel().model,
    },
    rules,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    lastRunAt: existing?.lastRunAt ?? null,
    lastError: existing?.lastError ?? null,
  };
  if (!next.approved) next.enabled = false;
  file.workflows = [
    next,
    ...file.workflows.filter((w) => w.id !== next.id),
  ];
  persist();
  return next;
}

export function patchWorkflow(
  id: string,
  patch: Partial<Pick<Workflow, 'enabled' | 'approved' | 'lastRunAt' | 'lastError' | 'name'>>,
): Workflow | null {
  const file = loadWorkflows();
  const i = file.workflows.findIndex((w) => w.id === id);
  if (i < 0) return null;
  const cur = file.workflows[i]!;
  const next: Workflow = {
    ...cur,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  if (!next.approved) next.enabled = false;
  file.workflows[i] = next;
  persist();
  return next;
}

export function deleteWorkflow(id: string): boolean {
  const file = loadWorkflows();
  const before = file.workflows.length;
  file.workflows = file.workflows.filter((w) => w.id !== id);
  if (file.workflows.length === before) return false;
  persist();
  return true;
}

export function enabledWorkflows(
  type: Workflow['trigger']['type'],
): Workflow[] {
  return listWorkflows().filter(
    (w) => w.approved && w.enabled && w.trigger.type === type,
  );
}
