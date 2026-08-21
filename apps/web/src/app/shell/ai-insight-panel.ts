import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  viewChild,
} from '@angular/core';

import { UiShellService } from '../core/ui-shell.service';

@Component({
  selector: 'lm-ai-insight-panel',
  template: `
    @if (shell.aiInsightOpen()) {
      <div
        class="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-lm-panel"
        aria-label="Thread chat"
      >
        <div
          class="flex shrink-0 items-center justify-between gap-2 border-b border-lm-border/70 bg-lm-bg/50 px-4 py-2"
        >
          <div class="flex min-w-0 items-center gap-2">
            <span class="text-sm" aria-hidden="true">✨</span>
            <span class="truncate text-[0.82rem] font-semibold text-lm-text">
              @if (shell.aiBusy()) {
                Summarizing…
              } @else {
                Thread chat
              }
            </span>
            @if (shell.aiInsightMode()) {
              <span
                class="shrink-0 rounded-full border border-lm-border px-1.5 py-0.5 text-[0.65rem] text-lm-muted"
                >{{ shell.aiInsightMode() }}</span
              >
            }
          </div>
          <button
            type="button"
            class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-lg leading-none text-lm-muted hover:bg-lm-hover hover:text-lm-text"
            (click)="shell.closeAiInsight()"
            aria-label="Close chat"
            title="Close (Esc)"
          >
            ×
          </button>
        </div>

        <div #chatScroll class="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          @if (shell.aiInsightError()) {
            <p class="m-0 mb-3 text-[0.82rem] leading-relaxed text-lm-danger">
              {{ shell.aiInsightError() }}
            </p>
          }
          @for (msg of shell.aiChatMessages(); track $index) {
            <div
              class="mb-2.5 flex"
              [class.justify-end]="msg.role === 'user'"
              [class.justify-start]="msg.role === 'assistant'"
            >
              <div
                class="max-w-[95%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[0.82rem] leading-relaxed break-words"
                [class.bg-lm-accent]="msg.role === 'user'"
                [class.text-white]="msg.role === 'user'"
                [class.bg-lm-bg]="msg.role === 'assistant'"
                [class.text-lm-text]="msg.role === 'assistant'"
              >
                {{ msg.content }}
              </div>
            </div>
          }
          @if (shell.aiBusy() && shell.aiChatMessages().length === 0) {
            <p class="m-0 text-[0.82rem] leading-relaxed text-lm-muted">
              Asking {{ summarizeModel() }} to summarize… this can take a while
              on a long thread.
            </p>
          }
          @if (shell.aiChatBusy()) {
            <p class="m-0 text-[0.82rem] text-lm-muted">Thinking…</p>
          }
        </div>

        <div class="shrink-0 border-t border-lm-border bg-lm-bg/40 px-3 py-2.5">
          <textarea
            #chatInput
            class="mb-2 max-h-28 min-h-14 w-full resize-none rounded-lg border border-lm-border bg-lm-panel px-3 py-2 text-[0.85rem] leading-relaxed text-lm-text outline-none placeholder:text-lm-muted"
            rows="2"
            placeholder="Ask about this thread…"
            [value]="shell.aiChatDraft()"
            [disabled]="shell.aiBusy() || shell.aiChatBusy()"
            (input)="onDraft($event)"
            (keydown)="onKey($event)"
          ></textarea>
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                class="cursor-pointer rounded-lg border border-lm-border bg-transparent px-2.5 py-1.5 text-[0.75rem] text-lm-text hover:bg-lm-hover disabled:opacity-40"
                (click)="shell.copyAiInsight()"
                [disabled]="!shell.lastAssistantReply()"
              >
                Copy
              </button>
              <button
                type="button"
                class="cursor-pointer rounded-lg border border-lm-border bg-transparent px-2.5 py-1.5 text-[0.75rem] text-lm-text hover:bg-lm-hover disabled:opacity-40"
                (click)="shell.insertInsightIntoReply()"
                [disabled]="!shell.isConnected() || !shell.lastAssistantReply()"
              >
                Insert into reply
              </button>
            </div>
            <button
              type="button"
              class="cursor-pointer rounded-lg border-0 bg-lm-accent px-3 py-1.5 text-[0.78rem] font-semibold text-white hover:brightness-110 disabled:opacity-40"
              (click)="shell.sendAiChat()"
              [disabled]="
                shell.aiBusy() ||
                shell.aiChatBusy() ||
                !shell.aiChatDraft().trim()
              "
            >
              {{ shell.aiChatBusy() ? 'Sending…' : 'Ask' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: flex;
      min-height: 0;
      flex: 1;
      flex-direction: column;
    }
  `,
})
export class AiInsightPanel {
  protected readonly shell = inject(UiShellService);
  private readonly injector = inject(Injector);
  protected readonly summarizeModel = computed(() => {
    const roles = this.shell.aiConfig()?.roles;
    return roles?.['summarize']?.model || this.shell.aiStatus()?.model || 'Ollama';
  });
  private readonly chatScroll = viewChild<ElementRef<HTMLElement>>('chatScroll');

  constructor() {
    effect(() => {
      void this.shell.aiChatMessages().length;
      void this.shell.aiChatBusy();
      void this.shell.aiBusy();
      afterNextRender(
        () => {
          const el = this.chatScroll()?.nativeElement;
          if (el) el.scrollTop = el.scrollHeight;
        },
        { injector: this.injector },
      );
    });
  }

  onDraft(event: Event): void {
    this.shell.setAiChatDraft((event.target as HTMLTextAreaElement).value);
  }

  onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void this.shell.sendAiChat();
    }
  }
}
