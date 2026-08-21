import { Component, effect, inject } from '@angular/core';

import { UiShellService } from '../core/ui-shell.service';

@Component({
  selector: 'lm-notify-toast',
  template: `
    @if (shell.lastNotify(); as n) {
      <div
        class="fixed top-4 right-4 z-[90] w-[min(22rem,calc(100vw-2rem))] cursor-pointer border border-lm-border bg-lm-panel px-4 py-3 shadow-[0_16px_48px_rgba(20,18,16,0.35)]"
        role="status"
        (click)="shell.openNotifyToast()"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="m-0 text-[0.68rem] tracking-[0.16em] text-lm-accent uppercase">
              New mail
            </p>
            <p class="lm-display mt-1 mb-0 truncate text-[1.05rem] font-medium text-lm-text">
              {{ n.title }}
            </p>
            <p class="mt-0.5 mb-0 line-clamp-2 text-[0.82rem] leading-snug text-lm-muted">
              {{ n.body }}
            </p>
          </div>
          <button
            type="button"
            class="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-lg leading-none text-lm-muted hover:bg-lm-hover hover:text-lm-text"
            (click)="shell.dismissNotifyToast(); $event.stopPropagation()"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      </div>
    }
  `,
})
export class NotifyToast {
  protected readonly shell = inject(UiShellService);

  constructor() {
    effect((onCleanup) => {
      const n = this.shell.lastNotify();
      if (!n) return;
      const t = window.setTimeout(() => this.shell.dismissNotifyToast(), 10_000);
      onCleanup(() => window.clearTimeout(t));
    });
  }
}
