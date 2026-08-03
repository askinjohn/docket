import { Component, computed, inject } from '@angular/core';

import { UiShellService } from '../core/ui-shell.service';

@Component({
  selector: 'lm-sidebar',
  template: `
    <aside
      class="relative flex h-full min-h-0 flex-col border-r border-lm-border/80 bg-lm-panel px-3 py-4"
      aria-label="Navigation"
    >
      <div class="mb-6 flex items-center gap-2.5 px-2">
        <span
          class="h-6 w-6 shrink-0 rounded-md bg-linear-to-br from-lm-accent to-lm-accent-2"
          aria-hidden="true"
        ></span>
        <span class="text-sm font-semibold tracking-tight text-lm-text">Local Mail</span>
      </div>

      @if (shell.coreStatus() === 'auth-expired') {
        <button
          type="button"
          class="mb-2 w-full rounded-lg bg-lm-accent px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
          (click)="shell.connectGmail()"
        >
          Sign in again
        </button>
        <p class="mb-5 px-1 text-[0.7rem] leading-relaxed text-lm-muted">
          Gmail session expired. Sign in to load new mail.
        </p>
      } @else if (shell.isConnected()) {
        <button
          type="button"
          class="mb-5 w-full rounded-lg bg-lm-accent px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          (click)="shell.openCompose()"
        >
          Compose
        </button>
      } @else if (shell.coreStatus() === 'misconfigured') {
        <p class="mb-4 px-2 text-xs leading-relaxed text-lm-muted">
          Add OAuth keys in apps/core/.env
        </p>
      } @else {
        <button
          type="button"
          class="mb-5 w-full rounded-lg bg-lm-accent px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-45"
          (click)="shell.connectGmail()"
          [disabled]="shell.coreStatus() === 'offline' || shell.coreStatus() === 'checking'"
        >
          Connect
        </button>
      }

      <nav class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-0.5">
        <button
          type="button"
          class="rounded-md px-2.5 py-2 text-left text-[0.8125rem] transition"
          [class.bg-lm-hover]="shell.mailView() === 'inbox'"
          [class.text-lm-text]="shell.mailView() === 'inbox'"
          [class.font-medium]="shell.mailView() === 'inbox'"
          [class.text-lm-muted]="shell.mailView() !== 'inbox'"
          (click)="shell.setMailView('inbox')"
        >
          Inbox
        </button>
        <button
          type="button"
          class="rounded-md px-2.5 py-2 text-left text-[0.8125rem] transition"
          [class.bg-lm-hover]="shell.mailView() === 'starred'"
          [class.text-lm-text]="shell.mailView() === 'starred'"
          [class.font-medium]="shell.mailView() === 'starred'"
          [class.text-lm-muted]="shell.mailView() !== 'starred'"
          (click)="shell.setMailView('starred')"
        >
          Starred
        </button>
        <button
          type="button"
          class="rounded-md px-2.5 py-2 text-left text-[0.8125rem] transition"
          [class.bg-lm-hover]="shell.mailView() === 'sent'"
          [class.text-lm-text]="shell.mailView() === 'sent'"
          [class.font-medium]="shell.mailView() === 'sent'"
          [class.text-lm-muted]="shell.mailView() !== 'sent'"
          (click)="shell.setMailView('sent')"
        >
          Sent
        </button>
        <button
          type="button"
          class="rounded-md px-2.5 py-2 text-left text-[0.8125rem] transition"
          [class.bg-lm-hover]="shell.mailView() === 'all'"
          [class.text-lm-text]="shell.mailView() === 'all'"
          [class.font-medium]="shell.mailView() === 'all'"
          [class.text-lm-muted]="shell.mailView() !== 'all'"
          (click)="shell.setMailView('all')"
        >
          All
        </button>

        @if (shell.customViews().length) {
          <div
            class="mt-3 mb-1 px-2.5 text-[0.65rem] font-semibold tracking-wide text-lm-muted uppercase"
          >
            Views
          </div>
          @for (v of shell.customViews(); track v.id) {
            <div class="group flex items-center gap-0.5">
              <button
                type="button"
                class="min-w-0 flex-1 truncate rounded-md px-2.5 py-1.5 text-left text-[0.8125rem] transition"
                [class.bg-lm-hover]="
                  shell.mailView() === 'custom' && shell.activeCustomViewId() === v.id
                "
                [class.font-medium]="
                  shell.mailView() === 'custom' && shell.activeCustomViewId() === v.id
                "
                [class.text-lm-muted]="
                  !(shell.mailView() === 'custom' && shell.activeCustomViewId() === v.id)
                "
                [title]="v.query"
                (click)="shell.openCustomView(v)"
              >
                {{ v.name }}
              </button>
              <button
                type="button"
                class="hidden shrink-0 rounded px-1.5 text-xs text-lm-muted group-hover:inline hover:bg-lm-hover hover:text-lm-danger"
                title="Delete view"
                (click)="shell.removeCustomView(v.id); $event.stopPropagation()"
              >
                ×
              </button>
            </div>
          }
        }

        @if (navLabels().length) {
          <div
            class="mt-3 mb-1 px-2.5 text-[0.65rem] font-semibold tracking-wide text-lm-muted uppercase"
          >
            Labels
          </div>
          @for (lab of navLabels(); track lab.id) {
            <button
              type="button"
              class="flex w-full items-center justify-between gap-1 rounded-md px-2.5 py-1.5 text-left text-[0.8125rem] transition"
              [class.bg-lm-hover]="
                shell.mailView() === 'label' && shell.activeLabelId() === lab.id
              "
              [class.font-medium]="
                shell.mailView() === 'label' && shell.activeLabelId() === lab.id
              "
              [class.text-lm-muted]="
                !(shell.mailView() === 'label' && shell.activeLabelId() === lab.id)
              "
              (click)="shell.openLabel(lab.id)"
            >
              <span class="min-w-0 truncate">{{ lab.name }}</span>
              <span class="shrink-0 text-[0.65rem] tabular-nums opacity-70">{{
                lab.count
              }}</span>
            </button>
          }
        }
      </nav>

      <div class="mt-auto space-y-1 border-t border-lm-border/60 pt-3">
        @if (shell.isConnected() || shell.coreStatus() === 'auth-expired') {
          <div class="relative">
            <button
              type="button"
              class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-lm-hover"
              (click)="shell.toggleAccountMenu()"
              [title]="shell.accountEmail() || ''"
            >
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lm-accent/25 text-[0.7rem] font-semibold text-lm-accent"
              >
                {{ accountInitial() }}
              </span>
              <span class="min-w-0 flex-1 truncate text-xs text-lm-muted">{{
                shell.accountEmail()
              }}</span>
              <span class="text-[0.65rem] text-lm-muted">▾</span>
            </button>

            @if (shell.accountMenuOpen()) {
              <div
                class="absolute bottom-full left-0 right-0 z-20 mb-1 overflow-hidden rounded-lg border border-lm-border bg-lm-panel py-1 shadow-xl"
              >
                @if (shell.accounts().length > 1) {
                  @for (acc of shell.accounts(); track acc.id) {
                    <button
                      type="button"
                      class="block w-full truncate px-3 py-2 text-left text-xs hover:bg-lm-hover"
                      [class.text-lm-accent]="shell.activeAccountId() === acc.id"
                      (click)="shell.switchAccount(acc.id); shell.closeAccountMenu()"
                    >
                      {{ acc.email }}
                    </button>
                  }
                  <div class="my-1 border-t border-lm-border"></div>
                }
                @if (shell.coreStatus() === 'auth-expired') {
                  <button
                    type="button"
                    class="block w-full px-3 py-2 text-left text-xs font-semibold text-lm-accent hover:bg-lm-hover"
                    (click)="shell.connectGmail(); shell.closeAccountMenu()"
                  >
                    Sign in again
                  </button>
                  <div class="my-1 border-t border-lm-border"></div>
                }
                <button
                  type="button"
                  class="block w-full px-3 py-2 text-left text-xs hover:bg-lm-hover"
                  (click)="shell.syncNow(); shell.closeAccountMenu()"
                >
                  {{ shell.syncing() ? 'Syncing…' : 'Sync' }}
                </button>
                <button
                  type="button"
                  class="block w-full px-3 py-2 text-left text-xs hover:bg-lm-hover"
                  (click)="shell.runDailySummary(); shell.closeAccountMenu()"
                >
                  Daily summary
                </button>
                <button
                  type="button"
                  class="block w-full px-3 py-2 text-left text-xs hover:bg-lm-hover"
                  (click)="shell.addAccount(); shell.closeAccountMenu()"
                >
                  Add account
                </button>
                <button
                  type="button"
                  class="block w-full px-3 py-2 text-left text-xs text-lm-danger hover:bg-lm-hover"
                  (click)="shell.removeActiveAccount(); shell.closeAccountMenu()"
                >
                  Remove account
                </button>
              </div>
            }
          </div>
        } @else {
          <div class="px-2 py-1 text-[0.7rem] text-lm-muted">
            @switch (shell.coreStatus()) {
              @case ('offline') {
                Core offline
              }
              @case ('checking') {
                Connecting…
              }
              @default {
                Not connected
              }
            }
          </div>
        }

        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-lm-muted hover:bg-lm-hover hover:text-lm-text"
          (click)="shell.openHelp()"
          title="Keyboard shortcuts (?)"
        >
          Shortcuts
          <span class="ml-auto font-mono text-[0.65rem] opacity-70">?</span>
        </button>
        <button
          type="button"
          class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-lm-muted hover:bg-lm-hover hover:text-lm-text"
          (click)="shell.openSettings()"
        >
          Settings
        </button>
      </div>
    </aside>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class Sidebar {
  protected readonly shell = inject(UiShellService);

  protected readonly accountInitial = computed(() => {
    const email = this.shell.accountEmail() || '?';
    return email.charAt(0).toUpperCase();
  });

  /** Hide system labels that already have primary nav entries. */
  protected readonly navLabels = computed(() => {
    const skip = new Set(['INBOX', 'STARRED', 'SENT', 'DRAFT', 'TRASH', 'SPAM']);
    return this.shell.labels().filter((l) => !skip.has(l.id)).slice(0, 24);
  });
}
