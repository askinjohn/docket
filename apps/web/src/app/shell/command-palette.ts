import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';

import { fuzzyFilter } from '../core/fuzzy';
import { UiShellService } from '../core/ui-shell.service';

export const PALETTE_ITEMS = [
  { cmd: 'sync', label: 'Sync inbox', hint: '' },
  { cmd: 'test-notify', label: 'Test notification', hint: '' },
  { cmd: 'compose', label: 'Compose', hint: 'c' },
  { cmd: 'reply', label: 'Reply', hint: 'r' },
  { cmd: 'archive', label: 'Archive', hint: 'e' },
  { cmd: 'undo', label: 'Undo archive', hint: 'z' },
  { cmd: 'star', label: 'Toggle star', hint: 's' },
  { cmd: 'unread', label: 'Mark unread', hint: 'u' },
  { cmd: 'search', label: 'Focus search', hint: '/' },
  { cmd: 'save-view', label: 'Save current search as view', hint: '' },
  { cmd: 'summary', label: 'Daily summary → notes', hint: '' },
  { cmd: 'ai-summary', label: 'AI summarize thread', hint: '' },
  { cmd: 'ai-draft', label: 'AI draft reply', hint: '' },
  { cmd: 'inbox', label: 'Go to inbox', hint: 'g i' },
  { cmd: 'starred', label: 'Go to starred', hint: 'g s' },
  { cmd: 'all', label: 'Go to all mail', hint: 'g a' },
  { cmd: 'sent', label: 'Go to sent', hint: '' },
  { cmd: 'theme', label: 'Toggle dark / light', hint: '' },
  { cmd: 'settings', label: 'Appearance settings', hint: '' },
  { cmd: 'help', label: 'Keyboard shortcuts', hint: '?' },
  { cmd: 'add-account', label: 'Add Google account', hint: '' },
] as const;

@Component({
  selector: 'lm-command-palette',
  template: `
    @if (shell.commandPaletteOpen()) {
      <div
        class="fixed inset-0 z-40 bg-black/45"
        (click)="shell.closeCommandPalette()"
      ></div>
      <div
        class="fixed top-[18%] left-1/2 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-lm-border bg-lm-panel px-4 py-4 shadow-2xl"
        role="dialog"
        aria-label="Command palette"
        aria-modal="true"
      >
        <div class="mb-2 font-semibold">Command palette</div>
        <input
          #queryInput
          type="search"
          class="mb-3 w-full rounded-lg border border-lm-border bg-lm-bg px-2.5 py-2 text-sm text-lm-text outline-none placeholder:text-lm-muted focus:border-lm-accent/50"
          placeholder="Type to filter…"
          [value]="query()"
          (input)="onQuery($event)"
          (keydown)="onKey($event)"
          autocomplete="off"
        />
        <div class="flex max-h-72 flex-col gap-1 overflow-auto">
          @for (item of filtered(); track item.cmd; let i = $index) {
            <button
              type="button"
              class="cursor-pointer rounded-lg border px-2.5 py-2 text-left text-sm"
              [class.border-lm-accent]="i === highlight()"
              [class.bg-lm-accent/15]="i === highlight()"
              [class.border-transparent]="i !== highlight()"
              [class.hover:border-lm-border]="i !== highlight()"
              [class.hover:bg-lm-hover]="i !== highlight()"
              (click)="run(item.cmd)"
              (mouseenter)="highlight.set(i)"
            >
              <span class="font-medium">{{ item.label }}</span>
              <span class="ml-2 text-xs text-lm-muted">{{ item.hint }}</span>
            </button>
          } @empty {
            <p class="m-0 px-1 py-2 text-sm text-lm-muted">No matching commands</p>
          }
        </div>
        <p class="mt-3 m-0 text-[0.72rem] text-lm-muted">
          ↑↓ navigate · Enter run · Esc close · ⌘K
        </p>
      </div>
    }
  `,
})
export class CommandPalette {
  protected readonly shell = inject(UiShellService);
  private readonly injector = inject(Injector);
  private readonly queryInput = viewChild<ElementRef<HTMLInputElement>>('queryInput');

  protected readonly query = signal('');
  protected readonly highlight = signal(0);
  protected readonly allItems = PALETTE_ITEMS;

  protected readonly filtered = computed(() =>
    fuzzyFilter(this.allItems, this.query(), (i) => `${i.label} ${i.hint} ${i.cmd}`),
  );

  constructor() {
    effect(() => {
      if (!this.shell.commandPaletteOpen()) {
        this.query.set('');
        this.highlight.set(0);
        return;
      }
      afterNextRender(
        () => this.queryInput()?.nativeElement?.focus(),
        { injector: this.injector },
      );
    });

    effect(() => {
      // Keep highlight in range when filter shrinks
      const n = this.filtered().length;
      if (this.highlight() >= n) this.highlight.set(Math.max(0, n - 1));
    });
  }

  onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.highlight.set(0);
  }

  onKey(event: KeyboardEvent): void {
    const list = this.filtered();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!list.length) return;
      this.highlight.update((h) => (h + 1) % list.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!list.length) return;
      this.highlight.update((h) => (h - 1 + list.length) % list.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = list[this.highlight()];
      if (item) this.run(item.cmd);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.shell.closeCommandPalette();
    }
  }

  run(cmd: string): void {
    this.shell.runPaletteCommand(cmd);
  }
}
