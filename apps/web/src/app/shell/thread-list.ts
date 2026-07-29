import { Component, inject } from '@angular/core';

import { UiShellService } from '../core/ui-shell.service';

@Component({
  selector: 'lm-thread-list',
  template: `
    <section
      class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-lm-border bg-lm-bg"
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
        <div class="flex items-center gap-1.5">
          <input
            type="search"
            class="min-w-0 flex-1 rounded-lg border border-lm-border bg-lm-panel px-2.5 py-1.5 text-sm text-lm-text outline-none placeholder:text-lm-muted focus:border-lm-accent/50"
            placeholder="Search Gmail… from: me has:attachment"
            [value]="shell.searchQuery()"
            (input)="onSearchInput($event)"
            (keydown.enter)="shell.runSearch()"
            title="Enter runs Gmail search (operators supported)"
          />
          @if (shell.searchQuery() || shell.searchActive()) {
            <button
              type="button"
              class="shrink-0 cursor-pointer rounded-lg border border-lm-border px-2 py-1.5 text-[0.75rem] text-lm-muted hover:bg-lm-hover hover:text-lm-text"
              (click)="shell.clearSearch()"
              title="Clear search"
            >
              Clear
            </button>
          }
        </div>
        @if (shell.searchActive() && shell.searchQuery()) {
          <div class="text-[0.68rem] text-lm-muted">
            @if (shell.searching()) {
              Searching Gmail…
            } @else {
              Gmail results · local filter “{{ shell.searchQuery() }}”
            }
          </div>
        }
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

      @if (shell.checkedCount() > 0) {
        <div
          class="mx-2.5 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-lm-accent/40 bg-lm-accent/10 px-2.5 py-2 text-[0.78rem]"
          role="toolbar"
          aria-label="Bulk selection"
        >
          <span class="font-medium text-lm-text"
            >{{ shell.checkedCount() }} selected</span
          >
          <div class="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              class="cursor-pointer rounded-md border border-lm-border bg-lm-panel px-2 py-1 text-lm-text hover:bg-lm-hover"
              (click)="shell.selectAllVisible()"
              title="Select all visible (⌘A)"
            >
              All
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-md border border-lm-border bg-lm-panel px-2 py-1 text-lm-text hover:bg-lm-hover"
              (click)="shell.clearChecked()"
              title="Clear selection (Esc)"
            >
              Clear
            </button>
            <button
              type="button"
              class="cursor-pointer rounded-md border-0 bg-lm-accent px-2 py-1 font-semibold text-white hover:brightness-110 disabled:opacity-40"
              (click)="shell.archiveSelected()"
              [disabled]="!shell.isConnected()"
              title="Archive selected (e)"
            >
              Archive
            </button>
          </div>
        </div>
      }

      <ul
        class="m-0 min-h-0 flex-1 list-none overflow-auto p-1.5"
        role="listbox"
        aria-label="Threads"
        aria-multiselectable="true"
        (scroll)="onThreadListScroll($event)"
      >
        @for (thread of shell.threads(); track thread.id) {
          <li>
            <button
              type="button"
              class="thread-row mb-0.5 flex w-full cursor-pointer items-start gap-2 rounded-lg border border-transparent bg-transparent px-2 py-2.5 text-left text-inherit hover:bg-lm-hover data-[selected=true]:border-lm-accent/35 data-[selected=true]:bg-lm-accent/15 data-[checked=true]:border-lm-accent/50 data-[checked=true]:bg-lm-accent/20"
              role="option"
              [attr.data-selected]="shell.selectedId() === thread.id"
              [attr.data-checked]="shell.isChecked(thread.id)"
              [attr.aria-selected]="
                shell.selectedId() === thread.id || shell.isChecked(thread.id)
              "
              (click)="onThreadClick(thread.id, $event)"
            >
              <span
                class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[0.65rem]"
                [class.border-lm-accent]="shell.isChecked(thread.id)"
                [class.bg-lm-accent]="shell.isChecked(thread.id)"
                [class.text-white]="shell.isChecked(thread.id)"
                [class.border-lm-border]="!shell.isChecked(thread.id)"
                aria-hidden="true"
                >{{ shell.isChecked(thread.id) ? '✓' : '' }}</span
              >
              <span class="min-w-0 flex-1">
                <div class="mb-0.5 flex justify-between gap-2">
                  <span
                    class="text-sm text-lm-text"
                    [class.font-semibold]="thread.unread"
                    >{{ thread.from }}</span
                  >
                  <span class="shrink-0 text-[0.72rem] text-lm-muted">{{
                    thread.time
                  }}</span>
                </div>
                <div
                  class="mb-0.5 truncate text-[0.82rem]"
                  [class.font-semibold]="thread.unread"
                >
                  @if (thread.hasAttachments || thread.messages[0]?.attachments?.length) {
                    <span class="mr-1 opacity-85" aria-hidden="true" title="Has attachments"
                      >📎</span
                    >
                  }
                  {{ thread.subject }}
                </div>
                <div class="truncate text-xs text-lm-muted">{{ thread.snippet }}</div>
              </span>
            </button>
          </li>
        } @empty {
          <li class="list-none px-4 py-4 text-sm text-lm-muted">{{ shell.emptyInboxHint() }}</li>
        }
      </ul>
      @if (shell.isConnected()) {
        <div class="shrink-0 border-t border-lm-border/70 px-2.5 py-2">
          <button
            type="button"
            class="w-full cursor-pointer rounded-lg border border-lm-border bg-transparent px-2.5 py-2 text-[0.78rem] font-medium text-lm-muted transition hover:bg-lm-hover hover:text-lm-text disabled:cursor-not-allowed disabled:opacity-40"
            (click)="shell.loadMoreMail()"
            [disabled]="
              shell.loadingMore() ||
              shell.listFilling() ||
              shell.syncing() ||
              shell.searching() ||
              !shell.hasMoreMail()
            "
            [title]="
              shell.searchActive()
                ? 'More Gmail search results'
                : 'Older inbox threads from Gmail (list aims for ~100)'
            "
          >
            @if (shell.listFilling()) {
              Filling list to ~100…
            } @else if (shell.loadingMore()) {
              Loading more…
            } @else if (shell.hasMoreMail()) {
              {{
                shell.searchActive()
                  ? 'More search results'
                  : 'Load more · ' + shell.threads().length + ' shown'
              }}
            } @else if (shell.searchActive()) {
              End of search results · {{ shell.threads().length }} shown
            } @else {
              {{ shell.threads().length }} in list
              @if (shell.threads().length < 100) {
                · all loaded from Gmail
              }
            }
          </button>
        </div>
      }
    </section>
  `,
  styles: `
    :host {
      display: contents;
    }
  `,
})
export class ThreadList {
  protected readonly shell = inject(UiShellService);
  private threadListNearTopArmed = true;

  onSearchInput(event: Event): void {
    this.shell.setSearchQuery((event.target as HTMLInputElement).value);
  }

  onThreadClick(id: string, event: MouseEvent): void {
    event.preventDefault();
    void this.shell.onThreadListClick(id, {
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
    });
  }

  /** Infinite scroll down + pull-new when near top again. */
  onThreadListScroll(event: Event): void {
    const el = event.target as HTMLElement;
    const distBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distBottom < 120) {
      this.shell.onThreadListScrollNearBottom();
    }
    if (el.scrollTop < 40) {
      if (!this.threadListNearTopArmed) {
        this.threadListNearTopArmed = true;
        this.shell.fetchNewMailNow('list-scroll-top');
      }
    } else if (el.scrollTop > 80) {
      this.threadListNearTopArmed = false;
    }
  }
}
