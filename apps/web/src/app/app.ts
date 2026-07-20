import { Component, inject } from '@angular/core';

import { UiShellService } from './core/ui-shell.service';

@Component({
  selector: 'lm-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class App {
  protected readonly shell = inject(UiShellService);

  onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing =
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable);

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.shell.toggleCommandPalette();
      return;
    }

    if (event.key === 'Escape') {
      this.shell.closeCommandPalette();
      return;
    }

    if (typing || this.shell.commandPaletteOpen()) return;

    if (event.key === 'j') {
      event.preventDefault();
      this.shell.selectNext();
    } else if (event.key === 'k') {
      event.preventDefault();
      this.shell.selectPrevious();
    }
  }
}
