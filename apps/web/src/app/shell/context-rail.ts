import { afterNextRender, Component, effect, ElementRef, inject, Injector, viewChild } from '@angular/core';

import { UiShellService } from '../core/ui-shell.service';

@Component({
  selector: 'lm-context-rail',
  template: `
    <aside class="rail" aria-label="Ask AI">
      <header class="rail-head">
        <div class="min-w-0 flex-1">
          <div class="text-[0.82rem] font-semibold text-lm-text">Ask AI</div>
          <div class="truncate text-[0.68rem] text-lm-muted">
            Inbox snapshot · {{ askModel() }}
          </div>
        </div>
        <button
          type="button"
          class="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-lg leading-none text-lm-muted hover:bg-lm-hover hover:text-lm-text"
          (click)="shell.closeMailboxAsk()"
          aria-label="Close Ask AI"
        >
          ×
        </button>
      </header>

      <div #askScroll class="rail-chat">
        @if (shell.mailboxAskError()) {
          <p class="m-0 mb-2 text-[0.78rem] leading-relaxed text-lm-danger">
            {{ shell.mailboxAskError() }}
          </p>
        }
        @if (shell.mailboxAskMessages().length === 0 && !shell.mailboxAskBusy()) {
          <p class="m-0 text-[0.78rem] leading-relaxed text-lm-muted">
            What’s in my inbox? Who’s waiting on me? Any unpaid invoices?
          </p>
        }
        @for (msg of shell.mailboxAskMessages(); track $index) {
          <div
            class="mb-2 flex min-w-0"
            [class.justify-end]="msg.role === 'user'"
            [class.justify-start]="msg.role === 'assistant'"
          >
            <div
              class="max-w-[95%] min-w-0 whitespace-pre-wrap rounded-xl px-2.5 py-1.5 text-[0.78rem] leading-relaxed break-words"
              [class.bg-lm-accent]="msg.role === 'user'"
              [class.text-white]="msg.role === 'user'"
              [class.bg-lm-bg]="msg.role === 'assistant'"
              [class.text-lm-text]="msg.role === 'assistant'"
            >
              {{ msg.content }}
            </div>
          </div>
        }
        @if (shell.mailboxAskBusy()) {
          <p class="m-0 text-[0.75rem] text-lm-muted">Thinking…</p>
        }
      </div>

      <form class="rail-form" (submit)="onAsk($event)">
        <textarea
          class="mb-2 min-h-16 w-full resize-none rounded-lg border border-lm-border bg-lm-bg px-2.5 py-2 text-[0.8rem] text-lm-text outline-none placeholder:text-lm-muted focus:border-lm-accent/50"
          rows="2"
          placeholder="Ask about your mailbox…"
          [value]="shell.mailboxAskDraft()"
          (input)="onDraft($event)"
          (keydown.meta.enter)="shell.sendMailboxAsk()"
          (keydown.control.enter)="shell.sendMailboxAsk()"
        ></textarea>
        <button
          type="submit"
          class="w-full cursor-pointer rounded-lg border-0 bg-lm-accent px-3 py-1.5 text-[0.78rem] font-semibold text-white hover:brightness-110 disabled:opacity-40"
          [disabled]="shell.mailboxAskBusy() || !shell.mailboxAskDraft().trim()"
        >
          Ask
        </button>
      </form>

      <section class="rail-block">
        <h3 class="rail-label">Recently opened</h3>
        <ul class="m-0 list-none p-0">
          @for (item of shell.recentOpens(); track item.id) {
            <li class="min-w-0">
              <button
                type="button"
                class="mb-0.5 flex w-full min-w-0 cursor-pointer flex-col rounded-md border-0 bg-transparent px-1.5 py-1.5 text-left hover:bg-lm-hover"
                [class.bg-lm-hover]="shell.selectedId() === item.id"
                (click)="shell.selectThread(item.id)"
              >
                <span class="block min-w-0 truncate text-[0.78rem] text-lm-text">{{
                  item.subject || '(no subject)'
                }}</span>
                <span class="block min-w-0 truncate text-[0.68rem] text-lm-muted">{{
                  item.from
                }}</span>
              </button>
            </li>
          } @empty {
            <li class="px-1.5 py-1 text-[0.75rem] text-lm-muted">
              Open a thread to pin it here.
            </li>
          }
        </ul>
      </section>

      @if (shell.selectedThread(); as thread) {
        <section class="rail-block">
          <h3 class="rail-label">This thread</h3>
          <p class="m-0 mb-2 min-w-0 truncate text-[0.8rem] font-medium text-lm-text">
            {{ thread.from }}
          </p>
          @if (shell.suggestedReplies().length) {
            <div class="flex flex-wrap gap-1">
              @for (chip of shell.suggestedReplies(); track chip) {
                <button
                  type="button"
                  class="cursor-pointer rounded-full border border-lm-border bg-lm-bg px-2 py-0.5 text-[0.7rem] text-lm-text hover:border-lm-accent/50 hover:bg-lm-hover"
                  (click)="shell.applySuggestedReply(chip)"
                >
                  {{ chip }}
                </button>
              }
            </div>
          }
        </section>
      }
    </aside>
  `,
  styles: `
    :host {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      z-index: 60;
      display: block;
      width: min(20rem, 92vw);
      height: 100dvh;
      max-height: 100dvh;
      overflow: hidden;
    }

    .rail {
      display: flex;
      height: 100%;
      min-width: 0;
      min-height: 0;
      flex-direction: column;
      overflow: hidden;
      border-left: 1px solid var(--color-lm-border);
      background: var(--color-lm-panel);
      box-shadow: -16px 0 40px rgba(0, 0, 0, 0.28);
    }

    .rail-head {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      gap: 0.5rem;
      border-bottom: 1px solid color-mix(in srgb, var(--color-lm-border) 70%, transparent);
      padding: 0.65rem 0.9rem;
    }

    .rail-chat {
      min-width: 0;
      min-height: 0;
      flex: 1 1 auto;
      overflow-x: hidden;
      overflow-y: auto;
      padding: 0.75rem;
      scrollbar-width: thin;
      scrollbar-color: color-mix(in srgb, var(--color-lm-muted) 45%, transparent) transparent;
    }

    .rail-form {
      flex-shrink: 0;
      border-top: 1px solid color-mix(in srgb, var(--color-lm-border) 70%, transparent);
      padding: 0.65rem;
    }

    .rail-block {
      flex-shrink: 0;
      min-width: 0;
      overflow: hidden;
      border-top: 1px solid var(--color-lm-border);
      padding: 0.75rem 0.9rem;
    }

    .rail-label {
      margin: 0 0 0.4rem;
      font-size: 0.68rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--color-lm-muted);
    }
  `,
})
export class ContextRail {
  protected readonly shell = inject(UiShellService);
  private readonly injector = inject(Injector);
  private readonly askScroll = viewChild<ElementRef<HTMLElement>>('askScroll');

  constructor() {
    effect(() => {
      this.shell.mailboxAskMessages();
      this.shell.mailboxAskBusy();
      afterNextRender(
        () => {
          const el = this.askScroll()?.nativeElement;
          if (el) el.scrollTop = el.scrollHeight;
        },
        { injector: this.injector },
      );
    });
  }

  protected askModel(): string {
    const cfg = this.shell.aiConfig();
    return cfg?.roles['ask']?.model || cfg?.roles['chat']?.model || 'local model';
  }

  onDraft(event: Event): void {
    this.shell.setMailboxAskDraft((event.target as HTMLTextAreaElement).value);
  }

  onAsk(event: Event): void {
    event.preventDefault();
    void this.shell.sendMailboxAsk();
  }
}
