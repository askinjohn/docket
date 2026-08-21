import { Component, inject } from '@angular/core';

import { UiShellService } from '../core/ui-shell.service';

@Component({
  selector: 'lm-auth-gate',
  template: `
    @if (shell.coreStatus() === 'auth-expired') {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-lm-bg/80 px-6 backdrop-blur-md"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="lm-auth-gate-title"
        aria-describedby="lm-auth-gate-body"
      >
        <div
          class="w-[min(26rem,calc(100vw-2rem))] border border-lm-border bg-lm-panel px-7 py-8 shadow-[0_24px_80px_rgba(20,18,16,0.35)]"
        >
          <p
            class="m-0 mb-3 font-[family-name:var(--font-lm-display)] text-[0.7rem] tracking-[0.22em] text-lm-accent uppercase"
          >
            Session ended
          </p>
          <h2
            id="lm-auth-gate-title"
            class="m-0 font-[family-name:var(--font-lm-display)] text-[1.65rem] leading-tight font-medium tracking-tight text-lm-text"
          >
            Sign in to Gmail again
          </h2>
          <p
            id="lm-auth-gate-body"
            class="mt-3 mb-0 text-[0.92rem] leading-relaxed text-lm-muted"
          >
            Google revoked Local Mail’s access
            @if (shell.accountEmail(); as email) {
              for <span class="text-lm-text">{{ email }}</span>
            }
            . Cached mail is hidden until you reconnect.
          </p>
          <button
            type="button"
            class="mt-6 w-full cursor-pointer border-0 bg-lm-accent px-4 py-2.5 text-[0.9rem] font-semibold text-white transition hover:brightness-110"
            (click)="shell.connectGmail()"
          >
            Sign in with Google
          </button>
          <button
            type="button"
            class="mt-2 w-full cursor-pointer border border-lm-border bg-transparent px-4 py-2 text-[0.82rem] text-lm-muted transition hover:bg-lm-hover hover:text-lm-text"
            (click)="shell.openSettings()"
          >
            Appearance settings
          </button>
          <p class="mt-3 mb-0 text-[0.72rem] leading-relaxed text-lm-muted">
            Mail stays on this machine. Sign-in only refreshes the Gmail token.
          </p>
        </div>
      </div>
    }
  `,
})
export class AuthGate {
  protected readonly shell = inject(UiShellService);
}
