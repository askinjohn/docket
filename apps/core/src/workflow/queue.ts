import { publish } from '../events/bus.js';
import { newId, type Workflow } from './catalog.js';
import { runWorkflow, type RunOptions } from './engine.js';
import { getWorkflow, type WorkflowJob } from './store.js';

const jobs: WorkflowJob[] = [];
const JOBS_CAP = 30;
const controllers = new Map<string, AbortController>();
let pumping = false;

function emit(job: WorkflowJob): void {
  publish({
    type: 'workflow.job',
    job,
    at: new Date().toISOString(),
  });
}

export function listJobs(): WorkflowJob[] {
  return jobs;
}

export function enqueueWorkflow(wf: Workflow, opts: RunOptions): WorkflowJob {
  const dryRun = Boolean(opts.dryRun) || opts.reason === 'dry-run';
  const job: WorkflowJob = {
    id: newId('job'),
    workflowId: wf.id,
    workflowName: wf.name,
    reason: opts.reason,
    dryRun,
    status: 'queued',
    threadCount: 0,
    scanned: 0,
    actions: [],
    current: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    threadId: opts.threadId,
    limit: opts.limit,
  };
  jobs.unshift(job);
  while (jobs.length > JOBS_CAP) jobs.pop();
  emit(job);
  void pump();
  return job;
}

export function cancelJob(id: string): WorkflowJob | null {
  const job = jobs.find((j) => j.id === id);
  if (!job) return null;
  if (job.status !== 'queued' && job.status !== 'running') return job;
  markCancelled(job);
  controllers.get(id)?.abort();
  emit(job);
  return job;
}

export function cancelWorkflowJobs(workflowId: string): WorkflowJob[] {
  const live = jobs.filter(
    (j) =>
      j.workflowId === workflowId &&
      (j.status === 'queued' || j.status === 'running'),
  );
  for (const job of live) cancelJob(job.id);
  return live;
}

function markCancelled(job: WorkflowJob): void {
  job.status = 'cancelled';
  job.error = 'Stopped';
  job.finishedAt = new Date().toISOString();
  job.current = null;
}

function isCancelled(job: WorkflowJob): boolean {
  return job.status === 'cancelled';
}

async function pump(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    for (;;) {
      const next = jobs.find((j) => j.status === 'queued');
      if (!next) return;
      next.status = 'running';
      emit(next);
      const wf = getWorkflow(next.workflowId);
      if (!wf) {
        next.status = 'error';
        next.error = 'Workflow missing';
        next.finishedAt = new Date().toISOString();
        emit(next);
        continue;
      }
      const ac = new AbortController();
      controllers.set(next.id, ac);
      try {
        const run = await runWorkflow(
          wf,
          {
            reason: next.reason,
            dryRun: next.dryRun,
            limit: next.limit ?? 120,
            threadId: next.threadId,
            signal: ac.signal,
          },
          (p) => {
            if (isCancelled(next)) return;
            next.threadCount = p.threadCount;
            next.scanned = p.scanned;
            next.actions = p.actions;
            next.current = p.current ?? null;
            if (p.output) next.output = p.output;
            emit(next);
          },
        );
        next.threadCount = run.threadCount;
        next.actions = run.actions;
        if (run.output) next.output = run.output;
        if (isCancelled(next) || ac.signal.aborted || run.error === 'Stopped') {
          markCancelled(next);
          next.actions = run.actions;
        } else {
          next.error = run.error;
          next.status = run.error ? 'error' : 'done';
          next.finishedAt = new Date().toISOString();
        }
        emit(next);
      } catch (e) {
        if (!isCancelled(next) && !ac.signal.aborted) {
          next.status = 'error';
          next.error = e instanceof Error ? e.message : String(e);
          next.finishedAt = new Date().toISOString();
        } else {
          markCancelled(next);
        }
        emit(next);
      } finally {
        controllers.delete(next.id);
      }
    }
  } finally {
    pumping = false;
  }
}
