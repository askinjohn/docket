import { Component, inject, OnInit } from '@angular/core';

import { UiShellService } from './core/ui-shell.service';
import { CommandPalette } from './shell/command-palette';
import { ComposeWindow } from './shell/compose-window';
import { ReadingPane } from './shell/reading-pane';
import { handleShellKeydown } from './shell/shell-hotkeys';
import { SettingsDialog } from './shell/settings-dialog';
import { ShortcutsHelp } from './shell/shortcuts-help';
import { Sidebar } from './shell/sidebar';
import { ThreadList } from './shell/thread-list';

/**
 * Root shell: layout chrome, global hotkeys, and overlay hosts.
 * Pane UI lives under `./shell/*`.
 */
@Component({
  selector: 'lm-root',
  imports: [
    Sidebar,
    ThreadList,
    ReadingPane,
    CommandPalette,
    SettingsDialog,
    ShortcutsHelp,
    ComposeWindow,
  ],
  template: `
    <div
      class="grid h-full max-h-dvh grid-cols-[200px_minmax(260px,320px)_minmax(0,1fr)] overflow-hidden bg-lm-bg text-lm-text"
    >
      <lm-sidebar />
      <lm-thread-list />
      <lm-reading-pane />
    </div>

    <lm-command-palette />
    <lm-settings-dialog />
    <lm-shortcuts-help />
    <lm-compose-window />

    @if (shell.imagePreview(); as preview) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        (click)="shell.closeImagePreview()"
        role="dialog"
        aria-label="Image preview"
        aria-modal="true"
      >
        <div
          class="relative flex max-h-full max-w-full flex-col items-center gap-3"
          (click)="$event.stopPropagation()"
        >
          <img
            class="max-h-[min(85vh,900px)] max-w-[min(92vw,1100px)] rounded-lg object-contain shadow-2xl"
            [src]="preview.url"
            [alt]="preview.name"
          />
          <div class="flex flex-wrap items-center justify-center gap-2">
            <span class="max-w-xs truncate text-sm text-white/90">{{ preview.name }}</span>
            <a
              class="cursor-pointer rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
              [href]="preview.url + '?download=1'"
              target="_blank"
              rel="noopener"
              >Download</a
            >
            <button
              type="button"
              class="cursor-pointer rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20"
              (click)="shell.closeImagePreview()"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      height: 100dvh;
      max-height: 100dvh;
      overflow: hidden;
      font-family: var(--font-lm);
    }
  `,
  host: {
    '(document:keydown)': 'onKeydown($event)',
    '(window:focus)': 'onWindowFocus()',
  },
})
export class App implements OnInit {
  protected readonly shell = inject(UiShellService);

  ngOnInit(): void {
    void this.shell.bootstrap();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.shell.imagePreview()) {
      event.preventDefault();
      this.shell.closeImagePreview();
      return;
    }
    handleShellKeydown(event, this.shell);
  }

  onWindowFocus(): void {
    this.shell.fetchNewMailNow('window-focus');
  }
}
