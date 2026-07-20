import { Component, inject, OnInit } from '@angular/core';

import { formatPlainBody, prefersHtml } from './core/email-body';
import { SafeSrcdocPipe } from './core/safe-srcdoc.pipe';
import type { ShellMessage } from './core/ui-shell.service';
import { UiShellService } from './core/ui-shell.service';

@Component({
  selector: 'lm-root',
  imports: [SafeSrcdocPipe],
  templateUrl: './app.html',
  styleUrl: './app.css',
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class App implements OnInit {
  protected readonly shell = inject(UiShellService);

  protected readonly paletteItems = [
    { cmd: 'sync', label: 'Sync inbox', hint: '' },
    { cmd: 'compose', label: 'Compose', hint: 'c' },
    { cmd: 'reply', label: 'Reply', hint: 'r' },
    { cmd: 'archive', label: 'Archive', hint: 'e' },
    { cmd: 'star', label: 'Toggle star', hint: 's' },
    { cmd: 'summary', label: 'Daily summary → notes', hint: '' },
    { cmd: 'ai-summary', label: 'AI summarize thread', hint: '' },
    { cmd: 'ai-draft', label: 'AI draft reply', hint: '' },
    { cmd: 'inbox', label: 'Go to inbox', hint: '' },
    { cmd: 'starred', label: 'Go to starred', hint: '' },
    { cmd: 'theme', label: 'Toggle theme', hint: '' },
  ];

  ngOnInit(): void {
    void this.shell.bootstrap();
  }

  onSearchInput(event: Event): void {
    this.shell.setSearchQuery((event.target as HTMLInputElement).value);
  }

  onComposeTo(event: Event): void {
    this.shell.setComposeTo((event.target as HTMLInputElement).value);
  }

  onComposeSubject(event: Event): void {
    this.shell.setComposeSubject((event.target as HTMLInputElement).value);
  }

  onComposeBody(event: Event): void {
    this.shell.setComposeBody((event.target as HTMLTextAreaElement).value);
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

  messagePlainText(msg: ShellMessage): string {
    const raw = msg.body?.trim() ? msg.body : stripTags(msg.bodyHtml || '');
    return formatPlainBody(raw);
  }

  /** Grow iframe to content; keep visible (no opacity hide — that caused blank white). */
  onHtmlFrameLoad(event: Event): void {
    const iframe = event.target as HTMLIFrameElement;
    const measure = (): void => {
      try {
        const doc = iframe.contentDocument;
        if (!doc?.body) {
          iframe.style.height = '12rem';
          return;
        }
        const h = Math.max(
          doc.body.scrollHeight,
          doc.body.offsetHeight,
          doc.documentElement?.scrollHeight ?? 0,
          doc.documentElement?.offsetHeight ?? 0,
        );
        // Avoid 0-height blank frame
        iframe.style.height = `${Math.min(Math.max(h + 16, 120), 2400)}px`;
      } catch {
        iframe.style.height = '20rem';
      }
    };

    measure();
    requestAnimationFrame(() => {
      measure();
      requestAnimationFrame(measure);
    });

    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      for (const img of Array.from(doc.images)) {
        if (!img.complete) {
          img.addEventListener('load', measure, { once: true });
          img.addEventListener('error', measure, { once: true });
        }
      }
      window.setTimeout(measure, 150);
      window.setTimeout(measure, 500);
    } catch {
      /* ignore */
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
    } else if (event.key === 's') {
      event.preventDefault();
      void this.shell.toggleStarSelected();
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
