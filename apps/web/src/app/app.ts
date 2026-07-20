import { Component, inject, OnInit } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';

import {
  formatPlainBody,
  prefersHtml,
  wrapEmailHtml,
} from './core/email-body';
import type { ShellMessage } from './core/ui-shell.service';
import { UiShellService } from './core/ui-shell.service';

@Component({
  selector: 'lm-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class App implements OnInit {
  protected readonly shell = inject(UiShellService);
  private readonly sanitizer = inject(DomSanitizer);

  ngOnInit(): void {
    void this.shell.bootstrap();
  }

  iconFor(kind: string): string {
    switch (kind) {
      case 'pdf':
        return '📕';
      case 'image':
        return '🖼️';
      case 'doc':
        return '📘';
      default:
        return '📎';
    }
  }

  messageUsesHtml(msg: ShellMessage): boolean {
    return prefersHtml(msg.bodyHtml);
  }

  /** Safe srcdoc for sandboxed iframe (scripts stripped; no allow-scripts). */
  messageHtmlSrcdoc(msg: ShellMessage): SafeHtml {
    const doc = wrapEmailHtml(msg.bodyHtml || '');
    return this.sanitizer.bypassSecurityTrustHtml(doc);
  }

  messagePlainText(msg: ShellMessage): string {
    const raw = msg.body?.trim() ? msg.body : stripTags(msg.bodyHtml || '');
    return formatPlainBody(raw);
  }

  onHtmlFrameLoad(event: Event): void {
    const iframe = event.target as HTMLIFrameElement;
    try {
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      const h = doc.body.scrollHeight;
      iframe.style.height = `${Math.min(Math.max(h + 16, 80), 1600)}px`;
    } catch {
      iframe.style.height = '320px';
    }
  }

  onReplyInput(event: Event): void {
    const value = (event.target as HTMLTextAreaElement).value;
    this.shell.setReplyBody(value);
  }

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

    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      if (this.shell.replyOpen() || this.shell.composeOpen()) {
        event.preventDefault();
        void this.shell.sendReply();
      }
      return;
    }

    if (event.key === 'Escape') {
      this.shell.closeCommandPalette();
      this.shell.closeCompose();
      return;
    }

    if (typing || this.shell.commandPaletteOpen() || this.shell.composeOpen()) {
      return;
    }

    if (event.key === 'j') {
      event.preventDefault();
      this.shell.selectNext();
    } else if (event.key === 'k') {
      event.preventDefault();
      this.shell.selectPrevious();
    } else if (event.key === 'r') {
      event.preventDefault();
      this.shell.openReply();
    } else if (event.key === 'c') {
      event.preventDefault();
      this.shell.openCompose();
    } else if (event.key === 'e') {
      event.preventDefault();
      void this.shell.archiveSelected();
    }
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
