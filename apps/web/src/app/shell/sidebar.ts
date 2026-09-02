import { Component, computed, inject, signal } from '@angular/core';

import { readPref, writePref } from '../core/pref-storage';
import { UiShellService } from '../core/ui-shell.service';

const LABELS_COLLAPSED_KEY = 'sidebar.labelsCollapsed';
const VIEWS_COLLAPSED_KEY = 'sidebar.viewsCollapsed';

function loadCollapsed(key: string, fallback = false): boolean {
  const v = readPref(key);
  if (v === null) return fallback;
  return v === '1' || v === 'true';
}

function saveCollapsed(key: string, collapsed: boolean): void {
  writePref(key, collapsed ? '1' : '0');
}

@Component({
  selector: 'lm-sidebar',
  template: `
    <aside
      class="relative flex h-full min-h-0 flex-col border-r border-lm-border/80 bg-lm-panel px-3 py-4"
      aria-label="Navigation"
    >
      <div class="mb-6 flex items-center gap-2.5 px-2">
        <span
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-[3px] bg-lm-accent text-[0.7rem] font-semibold text-white"
          aria-hidden="true"
          >D</span
        >
        <span
          class="lm-display text-[0.98rem] font-medium tracking-tight text-lm-text"
          >Docket</span
        >
      </div>

      @if (shell.coreStatus() === 'auth-expired') {
        <button
          type="button"
          class="mb-2 w-full rounded-md bg-lm-accent px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
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
          class="mb-2 w-full rounded-md bg-lm-accent px-3 py-2.5 text-sm font-semibold tracking-wide text-white transition hover:brightness-110 disabled:opacity-40"
          (click)="shell.openCompose()"
        >
          Compose
        </button>
        <button
          type="button"
          class="mb-5 w-full cursor-pointer rounded-md border border-lm-border bg-transparent px-3 py-2 text-sm text-lm-text hover:bg-lm-hover"
          (click)="shell.toggleMailboxAsk()"
        >
          Ask AI
        </button>
      } @else if (shell.coreStatus() === 'misconfigured') {
        <p class="mb-4 px-2 text-xs leading-relaxed text-lm-muted">
          Add OAuth keys in apps/core/.env
        </p>
      } @else {
        <button
          type="button"
          class="mb-5 w-full rounded-md bg-lm-accent px-3 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-45"
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
          [class.bg-lm-hover]="isMailNav('inbox')"
          [class.text-lm-text]="isMailNav('inbox')"
          [class.font-medium]="isMailNav('inbox')"
          [class.text-lm-muted]="!isMailNav('inbox')"
          (click)="shell.setMailView('inbox')"
        >
          Inbox
        </button>
        <button
          type="button"
          class="rounded-md px-2.5 py-2 text-left text-[0.8125rem] transition"
          [class.bg-lm-hover]="isMailNav('starred')"
          [class.text-lm-text]="isMailNav('starred')"
          [class.font-medium]="isMailNav('starred')"
          [class.text-lm-muted]="!isMailNav('starred')"
          (click)="shell.setMailView('starred')"
        >
          Starred
        </button>
        <button
          type="button"
          class="rounded-md px-2.5 py-2 text-left text-[0.8125rem] transition"
          [class.bg-lm-hover]="isMailNav('sent')"
          [class.text-lm-text]="isMailNav('sent')"
          [class.font-medium]="isMailNav('sent')"
          [class.text-lm-muted]="!isMailNav('sent')"
          (click)="shell.setMailView('sent')"
        >
          Sent
        </button>
        <button
          type="button"
          class="rounded-md px-2.5 py-2 text-left text-[0.8125rem] transition"
          [class.bg-lm-hover]="isMailNav('all')"
          [class.text-lm-text]="isMailNav('all')"
          [class.font-medium]="isMailNav('all')"
          [class.text-lm-muted]="!isMailNav('all')"
          (click)="shell.setMailView('all')"
        >
          All
        </button>
        <button
          type="button"
          class="mt-3 rounded-md px-2.5 py-2 text-left text-[0.8125rem] transition"
          [class.bg-lm-hover]="shell.shellSection() === 'workflows'"
          [class.text-lm-text]="shell.shellSection() === 'workflows'"
          [class.font-medium]="shell.shellSection() === 'workflows'"
          [class.text-lm-muted]="shell.shellSection() !== 'workflows'"
          (click)="shell.openWorkflows()"
        >
          <span class="flex items-center justify-between gap-2">
            Workflows
            @if (liveJobs()) {
              <span
                class="rounded-full bg-lm-accent/20 px-1.5 py-0.5 text-[0.62rem] font-semibold text-lm-accent"
                >{{ liveJobs() }}</span
              >
            }
          </span>
        </button>

        @if (shell.customViews().length) {
          <button
            type="button"
            class="mt-3 mb-0.5 flex w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-left text-[0.65rem] font-semibold tracking-wide text-lm-muted uppercase hover:bg-lm-hover hover:text-lm-text"
            (click)="toggleViews()"
            [attr.aria-expanded]="!viewsCollapsed()"
          >
            <svg
              class="size-3 shrink-0 opacity-80 transition-transform duration-150"
              [class.-rotate-90]="viewsCollapsed()"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 4.5 6 7.5 9 4.5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Views
            <span class="ml-auto font-normal normal-case tabular-nums opacity-70">{{
              shell.customViews().length
            }}</span>
          </button>
          @if (!viewsCollapsed()) {
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
        }

        @if (navLabels().length) {
          <button
            type="button"
            class="mt-3 mb-0.5 flex w-full items-center gap-1.5 rounded-md px-2.5 py-1 text-left text-[0.65rem] font-semibold tracking-wide text-lm-muted uppercase hover:bg-lm-hover hover:text-lm-text"
            (click)="toggleLabels()"
            [attr.aria-expanded]="!labelsCollapsed()"
          >
            <svg
              class="size-3 shrink-0 opacity-80 transition-transform duration-150"
              [class.-rotate-90]="labelsCollapsed()"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M3 4.5 6 7.5 9 4.5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Labels
            <span class="ml-auto font-normal normal-case tabular-nums opacity-70">{{
              navLabels().length
            }}</span>
          </button>
          @if (!labelsCollapsed()) {
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
                class="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-[min(50vh,320px)] overflow-y-auto rounded-lg border border-lm-border bg-lm-panel py-1 shadow-xl"
              >
                <div
                  class="px-3 pt-2 pb-1 text-[0.65rem] font-semibold tracking-wide text-lm-muted uppercase"
                >
                  Accounts
                </div>
                @if (shell.accounts().length) {
                  @for (acc of shell.accounts(); track acc.id) {
                    <button
                      type="button"
                      class="flex w-full items-center gap-2 truncate px-3 py-2 text-left text-xs hover:bg-lm-hover"
                      [class.text-lm-accent]="shell.isActiveAccount(acc)"
                      [class.font-semibold]="shell.isActiveAccount(acc)"
                      [class.bg-lm-accent/10]="shell.isActiveAccount(acc)"
                      (click)="shell.switchAccount(acc.id); shell.closeAccountMenu()"
                      [title]="
                        shell.isActiveAccount(acc)
                          ? 'Current account'
                          : 'Switch to ' + acc.email
                      "
                    >
                      <span class="min-w-0 flex-1 truncate">{{ acc.email }}</span>
                      @if (shell.isActiveAccount(acc)) {
                        <span class="shrink-0 text-[0.65rem] text-lm-accent">✓</span>
                      }
                    </button>
                  }
                } @else if (shell.accountEmail()) {
                  <div
                    class="flex items-center gap-2 truncate px-3 py-2 text-xs font-semibold text-lm-accent"
                  >
                    <span class="min-w-0 flex-1 truncate">{{ shell.accountEmail() }}</span>
                    <span class="shrink-0 text-[0.65rem]">✓</span>
                  </div>
                }
                <button
                  type="button"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-lm-accent hover:bg-lm-hover"
                  (click)="shell.addAccount(); shell.closeAccountMenu()"
                  title="Connect another Gmail account"
                >
                  + Add account
                </button>
                <div class="my-1 border-t border-lm-border"></div>
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
          title="Settings (⌘,)"
        >
          Settings
          <span class="ml-auto font-mono text-[0.65rem] opacity-70">⌘,</span>
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

  protected isMailNav(view: string): boolean {
    return this.shell.shellSection() === 'mail' && this.shell.mailView() === view;
  }

  protected liveJobs(): number {
    return this.shell
      .workflowJobs()
      .filter((j) => j.status === 'queued' || j.status === 'running').length;
  }

  /** Collapsed by default when there are many labels (saves sidebar space). */
  protected readonly labelsCollapsed = signal(
    loadCollapsed(LABELS_COLLAPSED_KEY, true),
  );
  protected readonly viewsCollapsed = signal(
    loadCollapsed(VIEWS_COLLAPSED_KEY, false),
  );

  protected readonly accountInitial = computed(() => {
    const email = this.shell.accountEmail() || '?';
    return email.charAt(0).toUpperCase();
  });

  /** Hide system labels that already have primary nav entries. */
  protected readonly navLabels = computed(() => {
    const skip = new Set(['INBOX', 'STARRED', 'SENT', 'DRAFT', 'TRASH', 'SPAM']);
    return this.shell.labels().filter((l) => !skip.has(l.id)).slice(0, 48);
  });

  toggleLabels(): void {
    this.labelsCollapsed.update((v) => {
      const next = !v;
      saveCollapsed(LABELS_COLLAPSED_KEY, next);
      return next;
    });
  }

  toggleViews(): void {
    this.viewsCollapsed.update((v) => {
      const next = !v;
      saveCollapsed(VIEWS_COLLAPSED_KEY, next);
      return next;
    });
  }
}
