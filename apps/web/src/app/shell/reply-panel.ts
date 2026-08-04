import { Component, inject, input } from '@angular/core';

import { UiShellService } from '../core/ui-shell.service';

@Component({
  selector: 'lm-reply-panel',
  template: `
    @if (shell.replyOpen()) {
      <div
        class="flex min-h-0 flex-col overflow-hidden border-lm-border bg-lm-panel"
        [class.border-t]="shell.theme().replyDock === 'bottom'"
        [class.flex-1]="shell.theme().replyDock === 'right'"
        aria-label="Reply"
      >
        <div
          class="flex shrink-0 items-center justify-between gap-2 border-b border-lm-border/70 bg-lm-bg/50 px-4 py-2"
        >
          <div class="flex min-w-0 items-center gap-2">
            <span
              class="h-1.5 w-1.5 shrink-0 rounded-full bg-lm-accent"
              aria-hidden="true"
            ></span>
            <span class="min-w-0 truncate text-[0.82rem] font-semibold text-lm-text"
              >Reply to {{ replyTo() }}</span
            >
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <div
              class="flex overflow-hidden rounded-lg border border-lm-border"
              role="group"
              aria-label="Reply dock position"
            >
              <button
                type="button"
                class="cursor-pointer border-0 px-2 py-1 text-[0.7rem]"
                [class.bg-lm-accent]="shell.theme().replyDock === 'bottom'"
                [class.text-white]="shell.theme().replyDock === 'bottom'"
                [class.bg-transparent]="shell.theme().replyDock !== 'bottom'"
                [class.text-lm-muted]="shell.theme().replyDock !== 'bottom'"
                (click)="shell.setReplyDock('bottom')"
                title="Dock at bottom"
              >
                Bottom
              </button>
              <button
                type="button"
                class="cursor-pointer border-0 border-l border-lm-border px-2 py-1 text-[0.7rem]"
                [class.bg-lm-accent]="shell.theme().replyDock === 'right'"
                [class.text-white]="shell.theme().replyDock === 'right'"
                [class.bg-transparent]="shell.theme().replyDock !== 'right'"
                [class.text-lm-muted]="shell.theme().replyDock !== 'right'"
                (click)="shell.setReplyDock('right')"
                title="Dock on the right"
              >
                Right
              </button>
            </div>
            <button
              type="button"
              class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-lg leading-none text-lm-muted hover:bg-lm-hover hover:text-lm-text"
              (click)="shell.closeReply()"
              aria-label="Close reply"
              title="Close (Esc)"
            >
              ×
            </button>
          </div>
        </div>
        <textarea
          class="min-h-24 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent px-4 py-3 text-[0.92rem] leading-relaxed text-lm-text outline-none placeholder:text-lm-muted/65"
          [class.max-h-44]="shell.theme().replyDock === 'bottom'"
          rows="5"
          [value]="shell.replyBody()"
          (input)="onReplyInput($event)"
          placeholder="Write your reply…"
        ></textarea>
        @if (shell.replyAttachments().length) {
          <ul
            class="m-0 flex list-none flex-wrap gap-1.5 border-t border-lm-border/60 px-4 py-2"
          >
            @for (file of shell.replyAttachments(); track file.id) {
              <li
                class="inline-flex max-w-52 items-center gap-1.5 rounded-lg border border-lm-border bg-lm-bg px-2 py-1 text-[0.72rem]"
              >
                <span class="truncate font-medium">{{ file.name }}</span>
                <span class="text-lm-muted">{{ file.sizeLabel }}</span>
                <button
                  type="button"
                  class="cursor-pointer border-0 bg-transparent px-1 text-lm-muted hover:text-lm-text"
                  (click)="shell.removeReplyAttachment(file.id)"
                  [attr.aria-label]="'Remove ' + file.name"
                >
                  ×
                </button>
              </li>
            }
          </ul>
        }
        <div
          class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-lm-border bg-lm-bg/40 px-4 py-2.5"
        >
          <div class="flex items-center gap-2">
            <label
              class="cursor-pointer rounded-lg border border-lm-border bg-transparent px-2.5 py-1.5 text-[0.78rem] text-lm-muted hover:bg-lm-hover hover:text-lm-text"
            >
              Attach
              <input
                type="file"
                class="sr-only"
                multiple
                (change)="onReplyFiles($event)"
              />
            </label>
            <span class="text-[0.7rem] text-lm-muted">⌘↵ send</span>
          </div>
          <button
            type="button"
            class="cursor-pointer rounded-lg border-0 bg-lm-accent px-3.5 py-1.5 text-[0.82rem] font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            (click)="shell.sendReply()"
            [disabled]="shell.sending() || !shell.isConnected()"
          >
            {{ shell.sending() ? 'Sending…' : 'Send' }}
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
export class ReplyPanel {
  protected readonly shell = inject(UiShellService);
  /** Display name in header (thread from). */
  readonly replyTo = input.required<string>();

  onReplyInput(event: Event): void {
    this.shell.setReplyBody((event.target as HTMLTextAreaElement).value);
  }

  onReplyFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.shell.addReplyFiles(input.files);
    input.value = '';
  }
}
