import {
  afterNextRender,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  viewChild,
} from '@angular/core';

import { UiShellService } from '../core/ui-shell.service';

@Component({
  selector: 'lm-compose-window',
  template: `
    @if (shell.composeOpen()) {
      <div
        class="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
        (click)="shell.closeCompose()"
      ></div>
      <div
        class="compose-window fixed right-4 bottom-4 z-50 flex max-h-[min(72vh,640px)] w-[min(560px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-lm-border bg-lm-panel shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        role="dialog"
        aria-label="New message"
        aria-modal="true"
        (click)="$event.stopPropagation()"
      >
        <header
          class="flex shrink-0 items-center justify-between gap-3 border-b border-lm-border bg-lm-bg/80 px-4 py-2.5"
        >
          <div class="flex min-w-0 items-center gap-2">
            <span
              class="h-2 w-2 shrink-0 rounded-full bg-lm-accent shadow-[0_0_8px_var(--color-lm-accent,theme(colors.lm-accent))]"
              aria-hidden="true"
            ></span>
            <strong class="truncate text-[0.9rem] font-semibold tracking-tight"
              >New message</strong
            >
          </div>
          <button
            type="button"
            class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-lg leading-none text-lm-muted transition hover:bg-lm-hover hover:text-lm-text"
            (click)="shell.closeCompose()"
            aria-label="Close compose"
            title="Close (Esc)"
          >
            ×
          </button>
        </header>

        <div class="shrink-0 px-4 pt-3">
          <div
            class="mb-0 grid grid-cols-[3.25rem_1fr] items-center gap-x-2 border-b border-lm-border/70 py-2 text-[0.8rem]"
          >
            <span class="text-lm-muted">From</span>
            <span class="truncate text-sm text-lm-text">{{
              shell.accountEmail() || '—'
            }}</span>
          </div>

          <div class="relative border-b border-lm-border/70">
            <label
              class="grid grid-cols-[3.25rem_1fr_auto] items-center gap-x-2 py-1.5 text-[0.8rem]"
            >
              <span class="text-lm-muted">To</span>
              <input
                #composeTo
                type="text"
                autocomplete="off"
                spellcheck="false"
                role="combobox"
                aria-autocomplete="list"
                [attr.aria-expanded]="
                  shell.contactSuggestField() === 'to' &&
                  shell.contactSuggestions().length > 0
                "
                class="min-w-0 border-0 bg-transparent py-1.5 text-sm text-lm-text outline-none placeholder:text-lm-muted/70"
                [value]="shell.composeTo()"
                (input)="onComposeTo($event)"
                (keydown)="onComposeRecipientKey($event)"
                (blur)="onComposeRecipientBlur()"
                placeholder="name@company.com"
              />
              @if (!shell.composeShowCc()) {
                <button
                  type="button"
                  class="cursor-pointer rounded-md border-0 bg-transparent px-1.5 py-1 text-[0.72rem] font-medium text-lm-accent hover:bg-lm-accent/10"
                  (click)="shell.showComposeCc()"
                >
                  Cc
                </button>
              }
            </label>
            @if (
              shell.contactSuggestField() === 'to' &&
              shell.contactSuggestions().length
            ) {
              <ul
                class="absolute top-full right-0 left-0 z-20 mt-0.5 max-h-48 overflow-auto rounded-lg border border-lm-border bg-lm-panel py-1 shadow-xl"
                role="listbox"
                aria-label="Suggested contacts from mail history"
              >
                @for (
                  c of shell.contactSuggestions();
                  track c.email;
                  let i = $index
                ) {
                  <li role="option" [attr.aria-selected]="shell.contactSuggestHighlight() === i">
                    <button
                      type="button"
                      class="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-lm-hover"
                      [class.bg-lm-accent/15]="shell.contactSuggestHighlight() === i"
                      (mousedown)="$event.preventDefault(); shell.pickContactSuggestion(c)"
                    >
                      <span
                        class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lm-accent/20 text-[0.7rem] font-semibold text-lm-accent"
                        >{{ c.name.charAt(0).toUpperCase() }}</span
                      >
                      <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-medium text-lm-text">{{
                          c.name
                        }}</span>
                        <span class="block truncate text-[0.72rem] text-lm-muted">{{
                          c.email
                        }}</span>
                      </span>
                    </button>
                  </li>
                }
              </ul>
            }
          </div>

          @if (shell.composeShowCc()) {
            <div class="relative border-b border-lm-border/70">
              <label
                class="grid grid-cols-[3.25rem_1fr] items-center gap-x-2 py-1.5 text-[0.8rem]"
              >
                <span class="text-lm-muted">Cc</span>
                <input
                  type="text"
                  autocomplete="off"
                  spellcheck="false"
                  class="min-w-0 border-0 bg-transparent py-1.5 text-sm text-lm-text outline-none placeholder:text-lm-muted/70"
                  [value]="shell.composeCc()"
                  (input)="onComposeCc($event)"
                  (keydown)="onComposeRecipientKey($event)"
                  (blur)="onComposeRecipientBlur()"
                  placeholder="optional@example.com"
                />
              </label>
              @if (
                shell.contactSuggestField() === 'cc' &&
                shell.contactSuggestions().length
              ) {
                <ul
                  class="absolute top-full right-0 left-0 z-20 mt-0.5 max-h-48 overflow-auto rounded-lg border border-lm-border bg-lm-panel py-1 shadow-xl"
                  role="listbox"
                >
                  @for (
                    c of shell.contactSuggestions();
                    track c.email;
                    let i = $index
                  ) {
                    <li role="option">
                      <button
                        type="button"
                        class="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-lm-hover"
                        [class.bg-lm-accent/15]="shell.contactSuggestHighlight() === i"
                        (mousedown)="$event.preventDefault(); shell.pickContactSuggestion(c)"
                      >
                        <span
                          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lm-accent/20 text-[0.7rem] font-semibold text-lm-accent"
                          >{{ c.name.charAt(0).toUpperCase() }}</span
                        >
                        <span class="min-w-0 flex-1">
                          <span class="block truncate text-sm font-medium">{{
                            c.name
                          }}</span>
                          <span class="block truncate text-[0.72rem] text-lm-muted">{{
                            c.email
                          }}</span>
                        </span>
                      </button>
                    </li>
                  }
                </ul>
              }
            </div>
          }

          <label
            class="grid grid-cols-[3.25rem_1fr] items-center gap-x-2 border-b border-lm-border/70 py-1.5 text-[0.8rem]"
          >
            <span class="text-lm-muted">Subject</span>
            <input
              type="text"
              class="min-w-0 border-0 bg-transparent py-1.5 text-sm font-medium text-lm-text outline-none placeholder:font-normal placeholder:text-lm-muted/70"
              [value]="shell.composeSubject()"
              (input)="onComposeSubject($event)"
              placeholder="What’s this about?"
            />
          </label>
        </div>

        <textarea
          class="min-h-48 w-full flex-1 resize-none border-0 bg-transparent px-4 py-3 text-[0.95rem] leading-relaxed text-lm-text outline-none placeholder:text-lm-muted/65"
          [value]="shell.composeBody()"
          (input)="onComposeBody($event)"
          placeholder="Write your message…"
          rows="10"
        ></textarea>

        @if (shell.composeAttachments().length) {
          <ul
            class="m-0 flex list-none flex-wrap gap-1.5 border-t border-lm-border/60 px-4 py-2"
          >
            @for (file of shell.composeAttachments(); track file.id) {
              <li
                class="inline-flex max-w-52 items-center gap-1.5 rounded-lg border border-lm-border bg-lm-bg px-2 py-1 text-[0.72rem]"
              >
                <span class="truncate font-medium">{{ file.name }}</span>
                <span class="text-lm-muted">{{ file.sizeLabel }}</span>
                <button
                  type="button"
                  class="cursor-pointer border-0 bg-transparent px-1 text-lm-muted hover:text-lm-text"
                  (click)="shell.removeComposeAttachment(file.id)"
                  [attr.aria-label]="'Remove ' + file.name"
                >
                  ×
                </button>
              </li>
            }
          </ul>
        }

        <footer
          class="flex shrink-0 items-center justify-between gap-3 border-t border-lm-border bg-lm-bg/50 px-4 py-3"
        >
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="cursor-pointer rounded-lg border-0 bg-transparent px-2.5 py-1.5 text-[0.8rem] text-lm-muted transition hover:bg-lm-hover hover:text-lm-text"
              (click)="shell.discardCompose()"
            >
              Discard
            </button>
            <label
              class="cursor-pointer rounded-lg border border-lm-border bg-transparent px-2.5 py-1.5 text-[0.78rem] text-lm-muted hover:bg-lm-hover hover:text-lm-text"
            >
              Attach
              <input
                type="file"
                class="sr-only"
                multiple
                (change)="onComposeFiles($event)"
              />
            </label>
          </div>
          <div class="flex items-center gap-2.5">
            <span class="hidden text-[0.7rem] text-lm-muted sm:inline" title="Send"
              >⌘↵</span
            >
            <button
              type="button"
              class="cursor-pointer rounded-lg border-0 bg-lm-accent px-4 py-2 text-[0.85rem] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              (click)="shell.sendCompose()"
              [disabled]="shell.sending()"
            >
              {{ shell.sending() ? 'Sending…' : 'Send' }}
            </button>
          </div>
        </footer>
      </div>
    }
  `,
  styles: `
    .compose-window {
      animation: compose-in 160ms ease-out;
    }

    @keyframes compose-in {
      from {
        opacity: 0;
        transform: translateY(10px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .compose-window {
        animation: none;
      }
    }
  `,
})
export class ComposeWindow {
  protected readonly shell = inject(UiShellService);
  private readonly injector = inject(Injector);
  private readonly composeToInput = viewChild<ElementRef<HTMLInputElement>>('composeTo');

  constructor() {
    effect(() => {
      if (!this.shell.composeOpen()) return;
      afterNextRender(
        () => {
          this.composeToInput()?.nativeElement?.focus();
        },
        { injector: this.injector },
      );
    });
  }

  onComposeTo(event: Event): void {
    this.shell.setComposeTo((event.target as HTMLInputElement).value);
  }

  onComposeCc(event: Event): void {
    this.shell.setComposeCc((event.target as HTMLInputElement).value);
  }

  onComposeSubject(event: Event): void {
    this.shell.setComposeSubject((event.target as HTMLInputElement).value);
  }

  onComposeBody(event: Event): void {
    this.shell.setComposeBody((event.target as HTMLTextAreaElement).value);
  }

  onComposeRecipientKey(event: KeyboardEvent): void {
    const open =
      this.shell.contactSuggestions().length > 0 &&
      this.shell.contactSuggestField() != null;
    if (!open) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.shell.moveContactHighlight(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.shell.moveContactHighlight(-1);
    } else if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      this.shell.pickContactSuggestion();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.shell.clearContactSuggestions();
    } else if (event.key === 'Tab' && !event.shiftKey) {
      event.preventDefault();
      this.shell.pickContactSuggestion();
    }
  }

  onComposeRecipientBlur(): void {
    window.setTimeout(() => this.shell.clearContactSuggestions(), 150);
  }

  onComposeFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    void this.shell.addComposeFiles(input.files);
    input.value = '';
  }
}
