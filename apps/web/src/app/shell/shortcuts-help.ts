import { Component, inject } from '@angular/core';

import { UiShellService } from '../core/ui-shell.service';

export const SHORTCUT_GROUPS = [
  {
    title: 'Navigate',
    items: [
      { keys: 'j / k', label: 'Next / previous thread' },
      { keys: 'g i', label: 'Go to Inbox' },
      { keys: 'g s', label: 'Go to Starred' },
      { keys: 'g a', label: 'Go to All' },
      { keys: '/', label: 'Focus search' },
      { keys: '⌘K', label: 'Command palette' },
    ],
  },
  {
    title: 'Triage',
    items: [
      { keys: 'e', label: 'Archive' },
      { keys: 'z', label: 'Undo archive' },
      { keys: 's', label: 'Toggle star' },
      { keys: 'u', label: 'Mark unread' },
      { keys: 'x', label: 'Toggle multi-select' },
      { keys: '⌘A', label: 'Select all visible' },
      { keys: 'Esc', label: 'Clear selection / close' },
    ],
  },
  {
    title: 'Compose',
    items: [
      { keys: 'c', label: 'Compose' },
      { keys: 'r', label: 'Reply' },
      { keys: '⌘↵', label: 'Send' },
    ],
  },
  {
    title: 'Help',
    items: [{ keys: '?', label: 'This shortcuts sheet' }],
  },
] as const;

@Component({
  selector: 'lm-shortcuts-help',
  template: `
    @if (shell.helpOpen()) {
      <div class="fixed inset-0 z-40 bg-black/50" (click)="shell.closeHelp()"></div>
      <div
        class="fixed top-1/2 left-1/2 z-50 max-h-[min(80vh,560px)] w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-lm-border bg-lm-panel p-5 shadow-2xl"
        role="dialog"
        aria-label="Keyboard shortcuts"
        aria-modal="true"
      >
        <div class="mb-4 flex items-center justify-between gap-3">
          <h2 class="m-0 text-base font-semibold">Keyboard shortcuts</h2>
          <button
            type="button"
            class="cursor-pointer rounded border-0 bg-transparent px-2 text-lg text-lm-muted hover:bg-lm-hover hover:text-lm-text"
            (click)="shell.closeHelp()"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div class="flex flex-col gap-4">
          @for (group of groups; track group.title) {
            <section>
              <h3
                class="m-0 mb-2 text-[0.7rem] font-semibold tracking-wide text-lm-muted uppercase"
              >
                {{ group.title }}
              </h3>
              <ul class="m-0 flex list-none flex-col gap-1 p-0">
                @for (item of group.items; track item.keys) {
                  <li class="flex items-center justify-between gap-3 py-1 text-sm">
                    <span class="text-lm-text">{{ item.label }}</span>
                    <kbd
                      class="shrink-0 rounded-md border border-lm-border bg-lm-bg px-2 py-0.5 font-mono text-[0.72rem] text-lm-muted"
                      >{{ item.keys }}</kbd
                    >
                  </li>
                }
              </ul>
            </section>
          }
        </div>
      </div>
    }
  `,
})
export class ShortcutsHelp {
  protected readonly shell = inject(UiShellService);
  protected readonly groups = SHORTCUT_GROUPS;
}
