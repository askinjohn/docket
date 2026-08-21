import { Component, inject } from '@angular/core';

import { UiShellService } from '../core/ui-shell.service';

@Component({
  selector: 'lm-workflow-report',
  template: `
    @if (shell.workflowReport(); as report) {
      <aside class="flex h-full min-h-0 min-w-0 flex-col bg-lm-panel" aria-label="Workflow answer">
        <header
          class="flex shrink-0 items-start justify-between gap-2 border-b border-lm-border/80 px-4 py-3"
        >
          <div class="min-w-0">
            <div class="text-[0.7rem] font-semibold tracking-wide text-lm-muted uppercase">
              Answer
            </div>
            <h2 class="m-0 truncate text-[0.92rem] font-semibold text-lm-text">
              {{ report.title }}
            </h2>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <button
              type="button"
              class="cursor-pointer rounded-md border border-lm-border bg-transparent px-2 py-1 text-[0.7rem] text-lm-text hover:bg-lm-hover"
              (click)="copy(report.body)"
            >
              Copy
            </button>
            <button
              type="button"
              class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-lg leading-none text-lm-muted hover:bg-lm-hover hover:text-lm-text"
              (click)="shell.closeWorkflowReport()"
              aria-label="Close answer"
            >
              ×
            </button>
          </div>
        </header>
        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <p
            class="m-0 whitespace-pre-wrap text-[0.84rem] leading-relaxed text-lm-text"
          >
            {{ report.body }}
          </p>
        </div>
      </aside>
    }
  `,
  styles: `
    :host {
      display: flex;
      min-width: 0;
      min-height: 0;
      height: 100%;
      flex-direction: column;
      overflow: hidden;
      border-left: 1px solid var(--color-lm-border);
    }
  `,
})
export class WorkflowReport {
  protected readonly shell = inject(UiShellService);

  async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.shell.statusMessage.set('Copied answer');
    } catch {
      this.shell.statusMessage.set('Could not copy');
    }
  }
}
