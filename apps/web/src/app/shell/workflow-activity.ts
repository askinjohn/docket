import { Component, inject } from '@angular/core';

import type { WorkflowJob } from '../core/mail-api.service';
import { UiShellService } from '../core/ui-shell.service';

@Component({
  selector: 'lm-workflow-activity',
  template: `
    @if (shell.workflowActivityOpen()) {
      <aside
        class="fixed right-4 bottom-4 z-[65] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-lm-border bg-lm-panel shadow-[0_16px_48px_rgba(16,14,12,0.4)]"
        aria-label="Workflow activity"
      >
        <header
          class="flex items-center justify-between gap-2 border-b border-lm-border/70 px-3 py-2"
        >
          <div class="min-w-0">
            <div class="text-[0.78rem] font-semibold text-lm-text">
              Workflow activity
            </div>
            <div class="truncate text-[0.68rem] text-lm-muted">
              {{ headline() }}
            </div>
          </div>
          <button
            type="button"
            class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-lg leading-none text-lm-muted hover:bg-lm-hover hover:text-lm-text"
            (click)="shell.closeWorkflowActivity()"
            aria-label="Hide activity"
          >
            ×
          </button>
        </header>
        <ul class="m-0 max-h-64 list-none overflow-y-auto p-2">
          @for (job of shell.workflowJobs().slice(0, 8); track job.id) {
            <li class="mb-1.5 rounded-lg border border-lm-border/70 px-2.5 py-2 last:mb-0">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="truncate text-[0.8rem] font-medium text-lm-text">
                    {{ job.workflowName }}
                  </div>
                  <div class="text-[0.68rem] text-lm-muted">
                    {{ statusLabel(job) }}
                  </div>
                  @if (job.status === 'running' && job.current) {
                    <div class="mt-1 truncate text-[0.72rem] text-lm-text">
                      Choosing tools · {{ job.current.from }} —
                      {{ job.current.subject }}
                    </div>
                  }
                </div>
                <div class="flex shrink-0 flex-col items-end gap-1">
                  <span
                    class="rounded-full px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase"
                    [class.bg-lm-accent/20]="job.status === 'running' || job.status === 'queued'"
                    [class.text-lm-accent]="job.status === 'running' || job.status === 'queued'"
                    [class.bg-lm-hover]="job.status === 'done' || job.status === 'cancelled'"
                    [class.text-lm-muted]="job.status === 'done' || job.status === 'cancelled'"
                    [class.text-lm-danger]="job.status === 'error'"
                  >
                    {{ job.status === 'cancelled' ? 'stopped' : job.status }}
                  </span>
                  @if (job.status === 'queued' || job.status === 'running') {
                    <button
                      type="button"
                      class="cursor-pointer rounded-md border border-lm-border bg-transparent px-1.5 py-0.5 text-[0.68rem] text-lm-danger hover:bg-lm-hover"
                      (click)="shell.stopWorkflowJob(job.id)"
                    >
                      Stop
                    </button>
                  }
                </div>
              </div>
              @if (job.threadCount > 0 && (job.status === 'running' || job.status === 'queued')) {
                <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-lm-hover">
                  <div
                    class="h-full bg-lm-accent"
                    [style.width.%]="progress(job)"
                  ></div>
                </div>
              }
              @if (job.actions.length) {
                <p class="m-0 mt-1 truncate text-[0.68rem] text-lm-muted">
                  {{ lastAction(job) }}
                </p>
              }
              @if (job.output) {
                <button
                  type="button"
                  class="mt-1 cursor-pointer border-0 bg-transparent p-0 text-[0.68rem] font-medium text-lm-accent hover:underline"
                  (click)="shell.openWorkflowReport(job)"
                >
                  Open answer
                </button>
              }
              @if (job.error) {
                <p class="m-0 mt-1 text-[0.7rem] text-lm-danger">{{ job.error }}</p>
              }
            </li>
          } @empty {
            <li class="px-2 py-3 text-[0.75rem] text-lm-muted">
              No runs yet. Dry run or Run now from Workflows.
            </li>
          }
        </ul>
      </aside>
    }
  `,
})
export class WorkflowActivity {
  protected readonly shell = inject(UiShellService);

  protected headline(): string {
    const jobs = this.shell.workflowJobs();
    const live = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
    if (live.length) return `${live.length} running in the background`;
    return 'Recent runs';
  }

  statusLabel(job: WorkflowJob): string {
    const kind = job.dryRun ? 'dry-run' : job.reason;
    if (job.status === 'queued') return `${kind} · waiting`;
    if (job.status === 'running') {
      const total = job.threadCount || 0;
      return total
        ? `${kind} · ${job.scanned}/${total} · ${job.actions.length} action(s)`
        : `${kind} · starting`;
    }
    if (job.status === 'error') return kind;
    if (job.status === 'cancelled') {
      return `${kind} · stopped · ${job.actions.length} action(s)`;
    }
    return `${kind} · ${job.actions.length} action(s) on ${job.threadCount}`;
  }

  lastAction(job: WorkflowJob): string {
    const a = job.actions.at(-1);
    if (!a) return '';
    let verb = a.action;
    if (a.action === 'addLabel') verb = 'Label “' + (a.detail || '') + '”';
    if (a.action === 'archive') verb = 'Leave inbox';
    const who = [a.from, a.subject].filter(Boolean).join(' — ');
    return who ? verb + ' · ' + who : verb;
  }

  progress(job: WorkflowJob): number {
    if (!job.threadCount) return 8;
    return Math.max(6, Math.round((job.scanned / job.threadCount) * 100));
  }
}
