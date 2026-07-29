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
  private readonly shell = inject(UiShellService);

  ngOnInit(): void {
    void this.shell.bootstrap();
  }

  onKeydown(event: KeyboardEvent): void {
    handleShellKeydown(event, this.shell);
  }

  onWindowFocus(): void {
    this.shell.fetchNewMailNow('window-focus');
  }
}
