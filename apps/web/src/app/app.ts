import {
  afterNextRender,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  OnInit,
  viewChild,
} from '@angular/core';

import { formatPlainBody, prefersHtml } from './core/email-body';
import { SafeSrcdocPipe } from './core/safe-srcdoc.pipe';
import type { ShellMessage } from './core/ui-shell.service';
import { UiShellService } from './core/ui-shell.service';

@Component({
  selector: 'lm-root',
  imports: [SafeSrcdocPipe],
  template: `
<div
  class="grid h-full max-h-dvh grid-cols-[200px_minmax(260px,320px)_minmax(0,1fr)] overflow-hidden bg-lm-bg text-lm-text"
>
  <!-- Sidebar — minimal -->
  <aside
    class="relative flex min-h-0 flex-col border-r border-lm-border/80 bg-lm-panel px-3 py-4"
    aria-label="Navigation"
  >
    <!-- Brand -->
    <div class="mb-6 flex items-center gap-2.5 px-2">
      <span
        class="h-6 w-6 shrink-0 rounded-md bg-linear-to-br from-lm-accent to-lm-accent-2"
        aria-hidden="true"
      ></span>
      <span class="text-sm font-semibold tracking-tight text-lm-text">Local Mail</span>
    </div>

    <!-- Primary CTA -->
    @if (shell.isConnected()) {
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

    <!-- Nav only -->
    <nav class="flex flex-col gap-0.5 px-0.5">
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
        [class.bg-lm-hover]="shell.mailView() === 'all'"
        [class.text-lm-text]="shell.mailView() === 'all'"
        [class.font-medium]="shell.mailView() === 'all'"
        [class.text-lm-muted]="shell.mailView() !== 'all'"
        (click)="shell.setMailView('all')"
      >
        All
      </button>
    </nav>

    <!-- Footer: account + tools (collapsed) -->
    <div class="mt-auto space-y-1 border-t border-lm-border/60 pt-3">
      @if (shell.isConnected()) {
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
        (click)="shell.openSettings()"
      >
        Settings
      </button>
    </div>
  </aside>

  <!-- Thread list -->
  <section
    class="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-lm-border bg-lm-bg"
    aria-label="Thread list"
  >
    <header class="flex shrink-0 flex-col gap-2 border-b border-lm-border px-4 py-3">
      <div class="flex items-center gap-2">
        <h1 class="m-0 text-[0.95rem] font-semibold capitalize">{{ shell.mailView() }}</h1>
        @if (shell.isConnected()) {
          <span
            class="rounded-full border border-lm-accent-2/50 px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wider text-lm-accent-2"
            >Live</span
          >
        }
        @if (shell.listLoading()) {
          <span
            class="rounded-full border border-lm-border px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wider text-lm-muted"
            >Loading</span
          >
        }
      </div>
      <input
        type="search"
        class="w-full rounded-lg border border-lm-border bg-lm-panel px-2.5 py-1.5 text-sm text-lm-text outline-none placeholder:text-lm-muted focus:border-lm-accent/50"
        placeholder="Search subject, from, snippet…"
        [value]="shell.searchQuery()"
        (input)="onSearchInput($event)"
        (keydown.enter)="shell.runSearch()"
      />
    </header>

    @if (shell.statusMessage() || shell.undoAvailable()) {
      <div
        class="mx-2.5 mt-2 flex items-center justify-between gap-2 rounded-lg border border-lm-border bg-lm-accent/10 px-2.5 py-1.5 text-[0.78rem] text-lm-muted"
        role="status"
      >
        <span class="min-w-0 flex-1 truncate">{{
          shell.statusMessage() || (shell.undoAvailable() ? 'Archived' : '')
        }}</span>
        @if (shell.undoAvailable()) {
          <button
            type="button"
            class="shrink-0 cursor-pointer rounded-md border border-lm-accent/40 bg-lm-accent/20 px-2 py-0.5 text-[0.72rem] font-semibold text-lm-text hover:bg-lm-accent/30"
            (click)="shell.undoArchive()"
            title="Undo archive (z)"
          >
            Undo
          </button>
        }
      </div>
    }

    <ul class="m-0 min-h-0 flex-1 list-none overflow-auto p-1.5" role="listbox" aria-label="Threads">
      @for (thread of shell.threads(); track thread.id) {
        <li>
          <button
            type="button"
            class="mb-0.5 w-full cursor-pointer rounded-lg border border-transparent bg-transparent px-2.5 py-2.5 text-left text-inherit hover:bg-lm-hover data-[selected=true]:border-lm-accent/35 data-[selected=true]:bg-lm-accent/15"
            role="option"
            [attr.data-selected]="shell.selectedId() === thread.id"
            [attr.aria-selected]="shell.selectedId() === thread.id"
            (click)="shell.selectThread(thread.id)"
          >
            <div class="mb-0.5 flex justify-between gap-2">
              <span
                class="text-sm text-lm-text"
                [class.font-semibold]="thread.unread"
                >{{ thread.from }}</span
              >
              <span class="shrink-0 text-[0.72rem] text-lm-muted">{{ thread.time }}</span>
            </div>
            <div
              class="mb-0.5 truncate text-[0.82rem]"
              [class.font-semibold]="thread.unread"
            >
              @if (thread.hasAttachments || thread.messages[0]?.attachments?.length) {
                <span class="mr-1 opacity-85" aria-hidden="true" title="Has attachments">📎</span>
              }
              {{ thread.subject }}
            </div>
            <div class="truncate text-xs text-lm-muted">{{ thread.snippet }}</div>
          </button>
        </li>
      } @empty {
        <li class="list-none px-4 py-4 text-sm text-lm-muted">{{ shell.emptyInboxHint() }}</li>
      }
    </ul>
  </section>

  <!-- Reading pane -->
  <section class="flex min-h-0 min-w-0 flex-col overflow-hidden bg-lm-bg" aria-label="Reading pane">
    @if (shell.selectedThread(); as thread) {
      <header class="shrink-0 border-b border-lm-border px-5 py-3.5">
        <div class="flex items-start justify-between gap-4">
          <h2 class="m-0 min-w-0 text-[1.05rem] font-semibold tracking-tight break-words">
            {{ thread.subject }}
          </h2>
          <div class="flex shrink-0 flex-wrap justify-end gap-1">
            <button
              type="button"
              class="cursor-pointer rounded-lg border border-lm-border bg-transparent px-2.5 py-1.5 text-[0.8rem] text-lm-text hover:bg-lm-hover disabled:opacity-40"
              (click)="shell.toggleStarSelected()"
              title="Star (s)"
              [disabled]="!shell.isConnected()"
            >
              {{ thread.starred ? '★ Starred' : '☆ Star' }}
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-lg border border-lm-border bg-transparent px-2.5 py-1.5 text-[0.8rem] text-lm-text hover:bg-lm-hover disabled:opacity-40"
              (click)="shell.aiSummarizeSelected()"
              [disabled]="!shell.isConnected() || shell.aiBusy()"
              title="AI summarize"
            >
              Summarize
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-lg border border-lm-border bg-transparent px-2.5 py-1.5 text-[0.8rem] text-lm-text hover:bg-lm-hover disabled:opacity-40"
              (click)="shell.aiDraftSelected()"
              [disabled]="!shell.isConnected() || shell.aiBusy()"
              title="AI draft reply"
            >
              AI draft
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-lg border border-lm-border bg-transparent px-2.5 py-1.5 text-[0.8rem] text-lm-text hover:bg-lm-hover"
              (click)="shell.openReply()"
              title="Reply (r)"
            >
              Reply
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-lg border border-lm-border bg-transparent px-2.5 py-1.5 text-[0.8rem] text-lm-text hover:bg-lm-hover disabled:cursor-not-allowed disabled:opacity-40"
              (click)="shell.archiveSelected()"
              title="Archive (e)"
              [disabled]="!shell.isConnected()"
            >
              Archive
            </button>
          </div>
        </div>
      </header>

      <div
        #readingScroll
        class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-6 py-5"
        (scroll)="onReadingScroll()"
      >
        @if (shell.detailLoading() && thread.messages.length === 0) {
          <div
            class="mb-3 min-h-64 max-w-3xl animate-pulse rounded-2xl border border-lm-border bg-lm-panel px-5 py-4"
            aria-busy="true"
          >
            <div class="mb-4 h-4 w-1/3 rounded bg-lm-hover"></div>
            <div class="mb-2 h-3 w-full rounded bg-lm-hover"></div>
            <div class="mb-2 h-3 w-5/6 rounded bg-lm-hover"></div>
            <div class="h-3 w-2/3 rounded bg-lm-hover"></div>
            <p class="mt-6 text-sm text-lm-muted">Loading message…</p>
          </div>
        }
        @for (msg of thread.messages; track msg.id) {
          <!-- Incoming HTML: wide card. Your plain replies: right bubble. -->
          @if (messageUsesHtml(msg) && !isMine(msg)) {
            <article
              class="msg-incoming mb-4 w-full max-w-3xl overflow-hidden rounded-2xl border border-lm-border bg-lm-panel shadow-sm"
            >
              <div class="flex items-start justify-between gap-4 border-b border-lm-border px-5 py-3">
                <div class="min-w-0">
                  <div class="text-sm font-semibold break-words text-lm-text">{{ msg.from }}</div>
                  <div class="mt-0.5 text-xs text-lm-muted break-words">To: {{ msg.to }}</div>
                </div>
                <time class="shrink-0 text-xs text-lm-muted">{{ msg.time }}</time>
              </div>
              <div class="message-html-wrap w-full overflow-hidden bg-white">
                <iframe
                  class="message-html-frame"
                  title="Message body"
                  sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  [srcdoc]="msg.bodyHtml | safeSrcdoc"
                  (load)="onHtmlFrameLoad($event)"
                ></iframe>
              </div>
              @if (msg.attachments.length) {
                <div class="border-t border-lm-border px-5 py-3" aria-label="Attachments">
                  <div class="mb-2 text-[0.72rem] tracking-wide text-lm-muted uppercase">
                    Attachments · {{ msg.attachments.length }}
                  </div>
                  <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
                    @for (file of msg.attachments; track file.id) {
                      <li>
                        <button
                          type="button"
                          class="inline-flex max-w-60 cursor-pointer items-center gap-2 rounded-lg border border-lm-border bg-lm-bg px-2.5 py-1.5 text-left text-sm hover:border-lm-accent/45 hover:bg-lm-hover"
                          (click)="shell.openAttachment(file.id)"
                          title="Download / open"
                        >
                          <span aria-hidden="true">{{ iconFor(file.kind) }}</span>
                          <span class="flex min-w-0 flex-col">
                            <span class="truncate text-[0.78rem] font-semibold">{{ file.name }}</span>
                            <span class="text-[0.68rem] text-lm-muted">{{ file.sizeLabel }}</span>
                          </span>
                        </button>
                      </li>
                    }
                  </ul>
                </div>
              }
            </article>
          } @else {
            <div
              class="mb-3 flex w-full"
              [class.justify-end]="isMine(msg)"
              [class.justify-start]="!isMine(msg)"
            >
              <article
                class="overflow-hidden rounded-2xl border px-4 py-3.5 shadow-sm"
                [class.max-w-xl]="isMine(msg)"
                [class.max-w-3xl]="!isMine(msg)"
                [class.w-full]="!isMine(msg)"
                [class.border-lm-border]="!isMine(msg)"
                [class.bg-lm-panel]="!isMine(msg)"
                [class.border-lm-accent/45]="isMine(msg)"
                [class.bg-lm-accent/15]="isMine(msg)"
              >
                <div
                  class="mb-2 flex min-w-0 justify-between gap-4"
                  [class.flex-row-reverse]="isMine(msg)"
                >
                  <div class="min-w-0" [class.text-right]="isMine(msg)">
                    <div class="text-sm font-semibold break-words">
                      @if (isMine(msg)) {
                        You
                      } @else {
                        {{ msg.from }}
                      }
                    </div>
                    <div class="mt-0.5 text-xs text-lm-muted break-words">To: {{ msg.to }}</div>
                  </div>
                  <time class="shrink-0 text-xs text-lm-muted">{{ msg.time }}</time>
                </div>

                @if (messageUsesHtml(msg)) {
                  <div class="message-html-wrap w-full overflow-hidden rounded-lg border border-lm-border bg-white">
                    <iframe
                      class="message-html-frame"
                      title="Message body"
                      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                      [srcdoc]="msg.bodyHtml | safeSrcdoc"
                      (load)="onHtmlFrameLoad($event)"
                    ></iframe>
                  </div>
                } @else {
                  <div
                    class="max-w-full whitespace-pre-wrap text-[0.92rem] leading-relaxed break-words text-lm-text"
                    [class.text-right]="isMine(msg)"
                  >
                    {{ messagePlainText(msg) }}
                  </div>
                }

                @if (msg.attachments.length) {
                  <div class="mt-3 border-t border-lm-border pt-3" aria-label="Attachments">
                    <ul
                      class="m-0 flex list-none flex-wrap gap-2 p-0"
                      [class.justify-end]="isMine(msg)"
                    >
                      @for (file of msg.attachments; track file.id) {
                        <li>
                          <button
                            type="button"
                            class="inline-flex max-w-60 cursor-pointer items-center gap-2 rounded-lg border border-lm-border bg-lm-bg px-2.5 py-1.5 text-left text-sm hover:border-lm-accent/45 hover:bg-lm-hover"
                            (click)="shell.openAttachment(file.id)"
                          >
                            <span aria-hidden="true">{{ iconFor(file.kind) }}</span>
                            <span class="truncate text-[0.78rem] font-semibold">{{ file.name }}</span>
                          </button>
                        </li>
                      }
                    </ul>
                  </div>
                }
              </article>
            </div>
          }
        } @empty {
          @if (!shell.detailLoading()) {
            <p class="py-2 text-sm text-lm-muted">No messages loaded for this thread.</p>
          }
        }
      </div>

      @if (shell.replyOpen()) {
        <footer
          class="flex max-h-[min(42vh,320px)] min-h-0 shrink-0 flex-col gap-2.5 overflow-hidden border-t border-lm-border bg-lm-panel px-4 py-3"
          aria-label="Reply"
        >
          <div class="flex shrink-0 items-center justify-between">
            <span class="min-w-0 truncate text-[0.8rem] font-semibold text-lm-muted"
              >Reply to {{ thread.from }}</span
            >
            <button
              type="button"
              class="cursor-pointer rounded border-0 bg-transparent px-2 py-0.5 text-lg leading-none text-lm-muted hover:bg-lm-hover hover:text-lm-text"
              (click)="shell.closeReply()"
              aria-label="Close reply"
            >
              ×
            </button>
          </div>
          <textarea
            class="min-h-[72px] max-h-40 w-full flex-1 resize-none overflow-y-auto rounded-[10px] border border-lm-border bg-lm-bg px-3 py-2.5 text-[0.9rem] leading-snug text-lm-text outline-none focus:outline-2 focus:outline-offset-1 focus:outline-lm-accent/55"
            rows="4"
            [value]="shell.replyBody()"
            (input)="onReplyInput($event)"
            placeholder="Write a reply… (⌘↵ to send)"
          ></textarea>

          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="text-[0.72rem] text-lm-muted">Plain-text send</span>
            <div class="flex items-center gap-2">
              <span class="font-mono text-[0.72rem] text-lm-muted">⌘↵</span>
              <button
                type="button"
                class="cursor-pointer rounded-lg border-0 bg-lm-accent px-2.5 py-1.5 text-[0.8rem] font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                (click)="shell.sendReply()"
                [disabled]="shell.sending() || !shell.isConnected()"
              >
                {{ shell.sending() ? 'Sending…' : 'Send' }}
              </button>
            </div>
          </div>
        </footer>
      } @else if (shell.isConnected()) {
        <button
          type="button"
          class="shrink-0 cursor-pointer border-0 border-t border-lm-border bg-lm-panel px-5 py-3.5 text-left text-sm text-lm-muted hover:bg-lm-hover hover:text-lm-text"
          (click)="shell.openReply()"
        >
          Click to reply ·
          <kbd class="rounded border border-lm-border bg-lm-bg px-1.5 py-0.5 font-mono text-xs"
            >r</kbd
          >
        </button>
      }
    } @else {
      <div class="m-auto text-sm text-lm-muted">{{ shell.emptyInboxHint() }}</div>
    }
  </section>
</div>

@if (shell.commandPaletteOpen()) {
  <div
    class="fixed inset-0 z-40 bg-black/45"
    (click)="shell.closeCommandPalette()"
  ></div>
  <div
    class="fixed top-[18%] left-1/2 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-lm-border bg-lm-panel px-4 py-4 shadow-2xl"
    role="dialog"
    aria-label="Command palette"
    aria-modal="true"
  >
    <div class="mb-2 font-semibold">Command palette</div>
    <div class="flex max-h-72 flex-col gap-1 overflow-auto">
      @for (item of paletteItems; track item.cmd) {
        <button
          type="button"
          class="cursor-pointer rounded-lg border border-transparent px-2.5 py-2 text-left text-sm hover:border-lm-border hover:bg-lm-hover"
          (click)="shell.runPaletteCommand(item.cmd)"
        >
          <span class="font-medium">{{ item.label }}</span>
          <span class="ml-2 text-xs text-lm-muted">{{ item.hint }}</span>
        </button>
      }
    </div>
    <p class="mt-3 m-0 text-[0.72rem] text-lm-muted">Esc to close · ⌘K to open</p>
  </div>
}

@if (shell.settingsOpen()) {
  <div class="fixed inset-0 z-40 bg-black/50" (click)="shell.closeSettings()"></div>
  <div
    class="fixed top-1/2 left-1/2 z-50 w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-lm-border bg-lm-panel p-5 shadow-2xl"
    role="dialog"
    aria-label="Appearance"
    aria-modal="true"
  >
    <div class="mb-4 flex items-center justify-between">
      <h2 class="m-0 text-base font-semibold">Appearance</h2>
      <button
        type="button"
        class="cursor-pointer rounded border-0 bg-transparent px-2 text-lg text-lm-muted hover:bg-lm-hover hover:text-lm-text"
        (click)="shell.closeSettings()"
        aria-label="Close"
      >
        ×
      </button>
    </div>

    <div class="mb-4">
      <div class="mb-2 text-xs font-medium tracking-wide text-lm-muted uppercase">Mode</div>
      <div class="flex gap-2">
        @for (m of ['dark', 'light', 'system']; track m) {
          <button
            type="button"
            class="flex-1 rounded-lg border px-2 py-2 text-sm capitalize"
            [class.border-lm-accent]="shell.theme().mode === m"
            [class.bg-lm-accent/15]="shell.theme().mode === m"
            [class.border-lm-border]="shell.theme().mode !== m"
            (click)="shell.setThemeMode($any(m))"
          >
            {{ m }}
          </button>
        }
      </div>
    </div>

    <div class="mb-4">
      <div class="mb-2 text-xs font-medium tracking-wide text-lm-muted uppercase">Accent</div>
      <div class="flex flex-wrap gap-2">
        @for (a of shell.accentPresets; track a.id) {
          <button
            type="button"
            class="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110"
            [class.border-lm-text]="shell.theme().accent === a.value"
            [class.border-transparent]="shell.theme().accent !== a.value"
            [style.background]="a.value"
            [title]="a.label"
            (click)="shell.setThemeAccent(a.value)"
          ></button>
        }
        <label
          class="flex h-8 cursor-pointer items-center gap-1 rounded-full border border-lm-border px-2 text-xs text-lm-muted hover:bg-lm-hover"
          title="Custom color"
        >
          <input
            type="color"
            class="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
            [value]="shell.theme().accent"
            (input)="onAccentColor($event)"
          />
          Custom
        </label>
      </div>
    </div>

    <div>
      <div class="mb-2 text-xs font-medium tracking-wide text-lm-muted uppercase">Density</div>
      <div class="flex gap-2">
        @for (d of ['comfortable', 'compact']; track d) {
          <button
            type="button"
            class="flex-1 rounded-lg border px-2 py-2 text-sm capitalize"
            [class.border-lm-accent]="shell.theme().density === d"
            [class.bg-lm-accent/15]="shell.theme().density === d"
            [class.border-lm-border]="shell.theme().density !== d"
            (click)="shell.setThemeDensity($any(d))"
          >
            {{ d }}
          </button>
        }
      </div>
    </div>
  </div>
}

@if (shell.composeOpen()) {
  <!-- Soft scrim — click outside discards only if empty / confirms if dirty -->
  <div
    class="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
    (click)="shell.closeCompose()"
  ></div>
  <div
    class="compose-window fixed right-4 bottom-4 z-50 flex max-h-[min(72vh,640px)] w-[min(560px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-lm-border bg-lm-panel shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
    role="dialog"
    aria-label="New message"
    aria-modal="true"
    (click)="$event.stopPropagation()"
  >
    <!-- Title bar -->
    <header
      class="flex shrink-0 items-center justify-between gap-3 border-b border-lm-border bg-lm-bg/80 px-4 py-2.5"
    >
      <div class="flex min-w-0 items-center gap-2">
        <span
          class="h-2 w-2 shrink-0 rounded-full bg-lm-accent shadow-[0_0_8px_var(--color-lm-accent,theme(colors.lm-accent))]"
          aria-hidden="true"
        ></span>
        <strong class="truncate text-[0.9rem] font-semibold tracking-tight"
          >New message</strong
        >
      </div>
      <button
        type="button"
        class="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-lg leading-none text-lm-muted transition hover:bg-lm-hover hover:text-lm-text"
        (click)="shell.closeCompose()"
        aria-label="Close compose"
        title="Close (Esc)"
      >
        ×
      </button>
    </header>

    <!-- Headers -->
    <div class="shrink-0 px-4 pt-3">
      <div
        class="mb-0 grid grid-cols-[3.25rem_1fr] items-center gap-x-2 border-b border-lm-border/70 py-2 text-[0.8rem]"
      >
        <span class="text-lm-muted">From</span>
        <span class="truncate text-sm text-lm-text">{{
          shell.accountEmail() || '—'
        }}</span>
      </div>

      <label
        class="grid grid-cols-[3.25rem_1fr_auto] items-center gap-x-2 border-b border-lm-border/70 py-1.5 text-[0.8rem]"
      >
        <span class="text-lm-muted">To</span>
        <input
          #composeTo
          type="email"
          autocomplete="email"
          class="min-w-0 border-0 bg-transparent py-1.5 text-sm text-lm-text outline-none placeholder:text-lm-muted/70"
          [value]="shell.composeTo()"
          (input)="onComposeTo($event)"
          placeholder="name@company.com"
        />
        @if (!shell.composeShowCc()) {
          <button
            type="button"
            class="cursor-pointer rounded-md border-0 bg-transparent px-1.5 py-1 text-[0.72rem] font-medium text-lm-accent hover:bg-lm-accent/10"
            (click)="shell.showComposeCc()"
          >
            Cc
          </button>
        }
      </label>

      @if (shell.composeShowCc()) {
        <label
          class="grid grid-cols-[3.25rem_1fr] items-center gap-x-2 border-b border-lm-border/70 py-1.5 text-[0.8rem]"
        >
          <span class="text-lm-muted">Cc</span>
          <input
            type="text"
            class="min-w-0 border-0 bg-transparent py-1.5 text-sm text-lm-text outline-none placeholder:text-lm-muted/70"
            [value]="shell.composeCc()"
            (input)="onComposeCc($event)"
            placeholder="optional@example.com"
          />
        </label>
      }

      <label
        class="grid grid-cols-[3.25rem_1fr] items-center gap-x-2 border-b border-lm-border/70 py-1.5 text-[0.8rem]"
      >
        <span class="text-lm-muted">Subject</span>
        <input
          type="text"
          class="min-w-0 border-0 bg-transparent py-1.5 text-sm font-medium text-lm-text outline-none placeholder:font-normal placeholder:text-lm-muted/70"
          [value]="shell.composeSubject()"
          (input)="onComposeSubject($event)"
          placeholder="What’s this about?"
        />
      </label>
    </div>

    <!-- Body -->
    <textarea
      class="min-h-48 w-full flex-1 resize-none border-0 bg-transparent px-4 py-3 text-[0.95rem] leading-relaxed text-lm-text outline-none placeholder:text-lm-muted/65"
      [value]="shell.composeBody()"
      (input)="onComposeBody($event)"
      placeholder="Write your message…"
      rows="10"
    ></textarea>

    <!-- Footer -->
    <footer
      class="flex shrink-0 items-center justify-between gap-3 border-t border-lm-border bg-lm-bg/50 px-4 py-3"
    >
      <button
        type="button"
        class="cursor-pointer rounded-lg border-0 bg-transparent px-2.5 py-1.5 text-[0.8rem] text-lm-muted transition hover:bg-lm-hover hover:text-lm-text"
        (click)="shell.discardCompose()"
      >
        Discard
      </button>
      <div class="flex items-center gap-2.5">
        <span class="hidden text-[0.7rem] text-lm-muted sm:inline" title="Send"
          >⌘↵</span
        >
        <button
          type="button"
          class="cursor-pointer rounded-lg border-0 bg-lm-accent px-4 py-2 text-[0.85rem] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          (click)="shell.sendCompose()"
          [disabled]="shell.sending()"
        >
          {{ shell.sending() ? 'Sending…' : 'Send' }}
        </button>
      </div>
    </footer>
  </div>
}

  `,
  styles: [`
/* Host height for Tauri/webview; iframe grows via JS after load */
:host {
  display: block;
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
  font-family: var(--font-lm);
}

.message-html-wrap {
  background: #fff;
  min-height: 8rem;
}

.message-html-frame {
  display: block;
  width: 100%;
  min-height: 12rem;
  height: 20rem;
  border: 0;
  background: #fff;
  vertical-align: top;
}

.msg-incoming .message-html-frame {
  min-height: 14rem;
}

.compose-window {
  animation: compose-in 160ms ease-out;
}

@keyframes compose-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .compose-window {
    animation: none;
  }
}

  `],
  host: {
    '(document:keydown)': 'onKeydown($event)',
  },
})
export class App implements OnInit {
  protected readonly shell = inject(UiShellService);
  private readonly injector = inject(Injector);

  /** Reading pane scroll container — keep latest message in view (chat-style). */
  private readonly readingScroll = viewChild<ElementRef<HTMLElement>>('readingScroll');
  private readonly composeToInput = viewChild<ElementRef<HTMLInputElement>>('composeTo');

  /** When true, keep pin to bottom (open thread / new msg / near bottom). Off if user scrolls up. */
  private stickReadingToBottom = true;
  private lastReadingThreadId: string | null = null;

  protected readonly paletteItems = [
    { cmd: 'sync', label: 'Sync inbox', hint: '' },
    { cmd: 'compose', label: 'Compose', hint: 'c' },
    { cmd: 'reply', label: 'Reply', hint: 'r' },
    { cmd: 'archive', label: 'Archive', hint: 'e' },
    { cmd: 'undo', label: 'Undo archive', hint: 'z' },
    { cmd: 'star', label: 'Toggle star', hint: 's' },
    { cmd: 'summary', label: 'Daily summary → notes', hint: '' },
    { cmd: 'ai-summary', label: 'AI summarize thread', hint: '' },
    { cmd: 'ai-draft', label: 'AI draft reply', hint: '' },
    { cmd: 'inbox', label: 'Go to inbox', hint: '' },
    { cmd: 'starred', label: 'Go to starred', hint: '' },
    { cmd: 'theme', label: 'Toggle dark / light', hint: '' },
    { cmd: 'settings', label: 'Appearance settings', hint: '' },
    { cmd: 'add-account', label: 'Add Google account', hint: '' },
  ];

  constructor() {
    // When a thread opens or its messages settle, jump to the latest message.
    effect(() => {
      const thread = this.shell.selectedThread();
      if (!thread) {
        this.lastReadingThreadId = null;
        return;
      }

      // New conversation → always show latest first.
      const isNewThread = thread.id !== this.lastReadingThreadId;
      if (isNewThread) {
        this.lastReadingThreadId = thread.id;
        this.stickReadingToBottom = true;
      }

      // Depend on identity + message list so we re-scroll after detail load / send.
      void thread.messages.length;
      void thread.messages.at(-1)?.id;
      void this.shell.detailLoading();
      void this.shell.replyOpen();

      // Force only on thread switch; later updates respect stick (near bottom / user scrolled up).
      const force = isNewThread || this.stickReadingToBottom;

      afterNextRender(
        () => {
          this.scrollReadingToLatest(force);
          // Second pass after layout; iframes may still resize later via onHtmlFrameLoad.
          requestAnimationFrame(() => this.scrollReadingToLatest(force));
          window.setTimeout(() => this.scrollReadingToLatest(force), 80);
        },
        { injector: this.injector },
      );
    });

    // Focus To when compose opens.
    effect(() => {
      if (!this.shell.composeOpen()) return;
      afterNextRender(
        () => {
          this.composeToInput()?.nativeElement?.focus();
        },
        { injector: this.injector },
      );
    });
  }

  ngOnInit(): void {
    void this.shell.bootstrap();
  }

  /** Track whether the user is still following the bottom of the thread. */
  onReadingScroll(): void {
    const el = this.readingScroll()?.nativeElement;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.stickReadingToBottom = distanceFromBottom < 80;
  }

  /**
   * Scroll reading pane so the newest message is in view (bottom of chat).
   * @param force when true (thread open / new messages), always pin to bottom.
   */
  private scrollReadingToLatest(force = false): void {
    if (!force && !this.stickReadingToBottom) return;
    const el = this.readingScroll()?.nativeElement;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    this.stickReadingToBottom = true;
  }

  onSearchInput(event: Event): void {
    this.shell.setSearchQuery((event.target as HTMLInputElement).value);
  }

  onComposeTo(event: Event): void {
    this.shell.setComposeTo((event.target as HTMLInputElement).value);
  }

  onComposeCc(event: Event): void {
    this.shell.setComposeCc((event.target as HTMLInputElement).value);
  }

  onComposeSubject(event: Event): void {
    this.shell.setComposeSubject((event.target as HTMLInputElement).value);
  }

  onComposeBody(event: Event): void {
    this.shell.setComposeBody((event.target as HTMLTextAreaElement).value);
  }

  onAccentColor(event: Event): void {
    this.shell.setThemeAccent((event.target as HTMLInputElement).value);
  }

  accountInitial(): string {
    const email = this.shell.accountEmail() || '?';
    return email.charAt(0).toUpperCase();
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

  /** True when From matches the active Gmail account (sent by you). */
  isMine(msg: ShellMessage): boolean {
    const me = this.shell.accountEmail()?.toLowerCase().trim();
    if (!me) return false;
    const from = (msg.from || '').toLowerCase();
    // "Name <email@x.com>" or bare email
    if (from.includes(`<${me}>`)) return true;
    if (from === me) return true;
    // bare email at end without brackets
    const m = from.match(/[\w.+-]+@[\w.-]+\.\w+/);
    return m?.[0] === me;
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
          this.scrollReadingToLatest();
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
      // After height changes, keep the latest message pinned if user is at bottom.
      this.scrollReadingToLatest(false);
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
      if (this.shell.composeOpen()) {
        event.preventDefault();
        void this.shell.sendCompose();
        return;
      }
      if (this.shell.replyOpen()) {
        event.preventDefault();
        void this.shell.sendReply();
      }
      return;
    }

    if (event.key === 'Escape') {
      if (this.shell.composeOpen()) {
        event.preventDefault();
        this.shell.closeCompose();
        return;
      }
      this.shell.closeCommandPalette();
      this.shell.closeSettings();
      this.shell.closeAccountMenu();
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
    } else if (event.key === 'z') {
      event.preventDefault();
      void this.shell.undoArchive();
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
