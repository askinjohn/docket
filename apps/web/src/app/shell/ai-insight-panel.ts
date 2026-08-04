import { Component, computed, inject } from '@angular/core';

import { parseInsightText } from '../core/ai-insight';
import { UiShellService } from '../core/ui-shell.service';

@Component({
  selector: 'lm-ai-insight-panel',
  template: `
    @if (shell.aiInsightOpen()) {
      <div
        class="flex min-h-0 flex-col overflow-hidden border-lm-border bg-lm-panel"
        [class.border-t]="shell.theme().replyDock === 'bottom'"
        [class.border-b]="shell.theme().replyDock === 'right' && shell.replyOpen()"
        aria-label="AI summary"
      >
        <div
          class="flex shrink-0 items-center justify-between gap-2 border-b border-lm-border/70 bg-lm-bg/50 px-4 py-2"
        >
          <div class="flex min-w-0 items-center gap-2">
            <span class="text-sm" aria-hidden="true">✨</span>
            <span class="truncate text-[0.82rem] font-semibold text-lm-text">{{
              insight().title
            }}</span>
            @if (modeLabel()) {
              <span
                class="shrink-0 rounded-full border border-lm-border px-1.5 py-0.5 text-[0.65rem] text-lm-muted"
                >{{ modeLabel() }}</span
              >
            }
          </div>
          <button
            type="button"
            class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-lg leading-none text-lm-muted hover:bg-lm-hover hover:text-lm-text"
            (click)="shell.closeAiInsight()"
            aria-label="Close summary"
            title="Close (Esc)"
          >
            ×
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          @if (insight().rows.length) {
            <dl class="m-0 grid gap-2">
              @for (row of insight().rows; track row.label) {
                <div class="grid grid-cols-[5.5rem_1fr] gap-2 text-[0.82rem]">
                  <dt class="m-0 text-lm-muted">{{ row.label }}</dt>
                  <dd class="m-0 break-words font-medium text-lm-text">{{ row.value }}</dd>
                </div>
              }
            </dl>
          }
          @if (insight().points.length) {
            <div [class.mt-3]="insight().rows.length" class="text-[0.82rem]">
              <div class="mb-1.5 text-[0.7rem] font-semibold tracking-wide text-lm-muted uppercase">
                Highlights
              </div>
              <ul class="m-0 list-none space-y-1.5 p-0">
                @for (p of insight().points; track $index) {
                  <li class="flex gap-2 leading-relaxed text-lm-text">
                    <span class="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-lm-accent" aria-hidden="true"></span>
                    <span class="min-w-0 break-words">{{ p }}</span>
                  </li>
                }
              </ul>
            </div>
          }
        </div>

        <div
          class="flex shrink-0 flex-wrap items-center gap-2 border-t border-lm-border bg-lm-bg/40 px-4 py-2.5"
        >
          <button
            type="button"
            class="cursor-pointer rounded-lg border border-lm-border bg-transparent px-2.5 py-1.5 text-[0.78rem] text-lm-text hover:bg-lm-hover"
            (click)="shell.copyAiInsight()"
          >
            Copy
          </button>
          <button
            type="button"
            class="cursor-pointer rounded-lg border-0 bg-lm-accent/90 px-2.5 py-1.5 text-[0.78rem] font-semibold text-white hover:brightness-110 disabled:opacity-40"
            (click)="shell.insertInsightIntoReply()"
            [disabled]="!shell.isConnected()"
          >
            Insert into reply
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class AiInsightPanel {
  protected readonly shell = inject(UiShellService);

  protected readonly insight = computed(() =>
    parseInsightText(this.shell.aiInsightText()),
  );

  protected readonly modeLabel = computed(() => {
    const mode = this.shell.aiInsightMode();
    const note = this.insight().modeNote;
    if (mode && note) return `${mode} · ${note}`;
    if (mode) return mode;
    return note;
  });
}
