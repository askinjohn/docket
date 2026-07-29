import { Component, inject } from '@angular/core';

import { UiShellService } from '../core/ui-shell.service';

export const PALETTE_ITEMS = [
  { cmd: 'sync', label: 'Sync inbox', hint: '' },
  { cmd: 'test-notify', label: 'Test notification', hint: '' },
  { cmd: 'compose', label: 'Compose', hint: 'c' },
  { cmd: 'reply', label: 'Reply', hint: 'r' },
  { cmd: 'archive', label: 'Archive', hint: 'e' },
  { cmd: 'undo', label: 'Undo archive', hint: 'z' },
  { cmd: 'star', label: 'Toggle star', hint: 's' },
  { cmd: 'summary', label: 'Daily summary → notes', hint: '' },
  { cmd: 'ai-summary', label: 'AI summarize thread', hint: '' },
  { cmd: 'ai-draft', label: 'AI draft reply', hint: '' },
  { cmd: 'inbox', label: 'Go to inbox', hint: '' },
  { cmd: 'starred', label: 'Go to starred', hint: '' },
  { cmd: 'theme', label: 'Toggle dark / light', hint: '' },
  { cmd: 'settings', label: 'Appearance settings', hint: '' },
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
        <div class="flex max-h-72 flex-col gap-1 overflow-auto">
          @for (item of paletteItems; track item.cmd) {
            <button
              type="button"
              class="cursor-pointer rounded-lg border border-transparent px-2.5 py-2 text-left text-sm hover:border-lm-border hover:bg-lm-hover"
              (click)="shell.runPaletteCommand(item.cmd)"
            >
              <span class="font-medium">{{ item.label }}</span>
              <span class="ml-2 text-xs text-lm-muted">{{ item.hint }}</span>
            </button>
          }
        </div>
        <p class="mt-3 m-0 text-[0.72rem] text-lm-muted">Esc to close · ⌘K to open</p>
      </div>
    }
  `,
})
export class CommandPalette {
  protected readonly shell = inject(UiShellService);
  protected readonly paletteItems = PALETTE_ITEMS;
}
