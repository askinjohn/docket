import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  viewChild,
} from '@angular/core';

import { UiShellService } from '../core/ui-shell.service';

/** Min pointer travel before a press becomes drag-select (px). */
const DRAG_THRESHOLD_PX = 6;
/** Edge zone for auto-scroll while dragging (px). */
const DRAG_SCROLL_EDGE_PX = 40;
const DRAG_SCROLL_STEP_PX = 18;

@Component({
  selector: 'lm-thread-list',
  template: `
    <section
      class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-r border-lm-border bg-lm-bg"
      aria-label="Thread list"
    >
      <header class="flex shrink-0 flex-col gap-2 border-b border-lm-border px-3.5 py-3">
        <div class="flex items-center gap-2">
          <h1 class="lm-display m-0 text-[1.15rem] font-medium capitalize tracking-tight">
            {{ shell.mailView() }}
          </h1>
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
            #searchInput
            type="search"
            class="min-w-0 flex-1 rounded-md border border-lm-border bg-lm-panel px-2.5 py-1.5 text-sm text-lm-text outline-none placeholder:text-lm-muted focus:border-lm-accent/55"
            placeholder="Search Gmail… from: me has:attachment"
            [value]="shell.searchQuery()"
            (input)="onSearchInput($event)"
            (keydown.enter)="shell.runSearch()"
            title="Enter runs Gmail search · / to focus"
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
          @if (shell.searchActive() && shell.searchQuery().trim()) {
            <button
              type="button"
              class="shrink-0 cursor-pointer rounded-lg border border-lm-accent/40 bg-lm-accent/10 px-2 py-1.5 text-[0.75rem] font-medium text-lm-text hover:bg-lm-accent/20"
              (click)="shell.addCustomViewFromSearch()"
              title="Save this Gmail query as a sidebar view"
            >
              Save view
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
          <span class="min-w-0 flex-1 truncate">{{ statusBannerText() }}</span>
          <div class="flex shrink-0 items-center gap-1">
            @if (shell.undoAvailable()) {
              <button
                type="button"
                class="cursor-pointer rounded-md border border-lm-accent/40 bg-lm-accent/20 px-2 py-0.5 text-[0.72rem] font-semibold text-lm-text hover:bg-lm-accent/30"
                (click)="shell.undoArchive()"
                title="Undo archive (z) — multi-step stack"
              >
                {{ undoButtonLabel() }}
              </button>
            }
            @if (shell.statusMessage()) {
              <button
                type="button"
                class="flex h-6 w-6 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-base leading-none text-lm-muted hover:bg-lm-hover hover:text-lm-text"
                (click)="shell.clearStatusMessage()"
                title="Dismiss"
                aria-label="Dismiss status"
              >
                ×
              </button>
            }
          </div>
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
        #threadListEl
        class="m-0 min-h-0 flex-1 list-none overflow-auto p-1.5 select-none"
        role="listbox"
        aria-label="Threads"
        aria-multiselectable="true"
        (scroll)="onThreadListScroll($event)"
        (pointermove)="onListPointerMove($event)"
        (pointerup)="onListPointerUp($event)"
        (pointercancel)="onListPointerUp($event)"
      >
        @for (thread of shell.threads(); track thread.id) {
          <li>
            <button
              type="button"
              class="thread-row mb-px flex w-full cursor-pointer items-start gap-2 rounded-sm border border-transparent bg-transparent px-2.5 py-2 text-left text-inherit hover:bg-lm-hover data-[selected=true]:bg-lm-hover data-[checked=true]:bg-lm-accent/12"
              [class.thread-row-wide]="!shell.isSplitLayout()"
              role="option"
              [attr.data-thread-id]="thread.id"
              [attr.data-selected]="shell.selectedId() === thread.id"
              [attr.data-cursor]="shell.isListCursor(thread.id)"
              [attr.data-checked]="shell.isChecked(thread.id)"
              [attr.aria-selected]="
                shell.isListCursor(thread.id) || shell.isChecked(thread.id)
              "
              (pointerdown)="onRowPointerDown(thread.id, $event)"
              (click)="onThreadClick(thread.id, $event)"
            >
              <span
                class="mt-1.5 flex h-2 w-2 shrink-0 items-center justify-center"
                [class.mt-0]="!shell.isSplitLayout()"
                [class.self-center]="!shell.isSplitLayout()"
                aria-hidden="true"
              >
                @if (thread.unread) {
                  <span
                    class="h-1.5 w-1.5 rounded-full bg-lm-accent shadow-[0_0_6px_var(--color-lm-accent)]"
                    title="Unread"
                  ></span>
                }
              </span>
              <span
                class="min-w-0 flex-1"
                [class.thread-wide-cols]="!shell.isSplitLayout()"
              >
                @if (shell.isSplitLayout()) {
                  <div class="mb-0.5 flex justify-between gap-2">
                    <span
                      class="lm-display min-w-0 truncate text-[0.92rem] text-lm-text"
                      [class.font-semibold]="thread.unread"
                      [class.text-lm-muted]="!thread.unread"
                      >{{ thread.from }}</span
                    >
                    <span
                      class="shrink-0 text-[0.72rem] tabular-nums text-lm-muted"
                      [class.text-lm-accent]="thread.unread"
                      [class.font-medium]="thread.unread"
                      >{{ thread.time }}</span
                    >
                  </div>
                  <div
                    class="mb-0.5 flex min-w-0 items-center gap-1 truncate text-[0.82rem]"
                    [class.font-semibold]="thread.unread"
                    [class.text-lm-text]="thread.unread"
                    [class.text-lm-muted]="!thread.unread"
                  >
                    @if (thread.starred) {
                      <span class="shrink-0 text-[0.75rem] text-amber-400" title="Starred" aria-hidden="true">★</span>
                    }
                    @if (thread.hasAttachments || thread.messages[0]?.attachments?.length) {
                      <span class="shrink-0 opacity-85" aria-hidden="true" title="Has attachments">📎</span>
                    }
                    <span class="min-w-0 truncate">{{ thread.subject }}</span>
                  </div>
                  <div class="truncate text-xs text-lm-muted">{{ thread.snippet }}</div>
                } @else {
                  <span
                    class="lm-display min-w-0 truncate text-[0.92rem] text-lm-text"
                    [class.font-semibold]="thread.unread"
                    [class.text-lm-muted]="!thread.unread"
                    >{{ thread.from }}</span
                  >
                  <span
                    class="flex min-w-0 items-center gap-1 truncate text-[0.82rem]"
                    [class.font-semibold]="thread.unread"
                    [class.text-lm-text]="thread.unread"
                    [class.text-lm-muted]="!thread.unread"
                  >
                    @if (thread.starred) {
                      <span class="shrink-0 text-[0.75rem] text-amber-400" title="Starred" aria-hidden="true">★</span>
                    }
                    @if (thread.hasAttachments || thread.messages[0]?.attachments?.length) {
                      <span class="shrink-0 opacity-85" aria-hidden="true" title="Has attachments">📎</span>
                    }
                    <span class="min-w-0 truncate">{{ thread.subject }}</span>
                  </span>
                  <span class="min-w-0 truncate text-xs text-lm-muted">{{
                    thread.snippet
                  }}</span>
                  <span
                    class="shrink-0 text-[0.72rem] tabular-nums text-lm-muted"
                    [class.text-lm-accent]="thread.unread"
                    [class.font-medium]="thread.unread"
                    >{{ thread.time }}</span
                  >
                }
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

    .thread-wide-cols {
      display: grid;
      grid-template-columns: minmax(9rem, 16rem) minmax(12rem, 1.2fr) minmax(8rem, 1fr) auto;
      align-items: center;
      gap: 0.85rem;
    }
  `,
  host: {
    '[attr.data-layout]': 'shell.theme().uiLayout',
  },
})
export class ThreadList {
  protected readonly shell = inject(UiShellService);
  private readonly injector = inject(Injector);
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly threadListEl = viewChild<ElementRef<HTMLUListElement>>('threadListEl');
  private threadListNearTopArmed = true;

  /** Active press that may become drag-select. */
  private dragState: {
    startId: string;
    pointerId: number;
    startX: number;
    startY: number;
    didDrag: boolean;
    lastId: string;
  } | null = null;

  /** Suppress the synthetic click after a successful drag-select. */
  private suppressClick = false;

  protected readonly statusBannerText = computed(() => {
    const msg = this.shell.statusMessage();
    if (msg) return msg;
    if (!this.shell.undoAvailable()) return '';
    const n = this.shell.undoCount();
    return n > 1 ? `Archived · ${n} undos` : 'Archived';
  });

  protected readonly undoButtonLabel = computed(() => {
    const n = this.shell.undoCount();
    return n > 1 ? `Undo (${n})` : 'Undo';
  });

  constructor() {
    effect(() => {
      const nonce = this.shell.searchFocusNonce();
      if (!nonce) return;
      afterNextRender(
        () => {
          const el = this.searchInput()?.nativeElement;
          if (!el) return;
          el.focus();
          el.select();
        },
        { injector: this.injector },
      );
    });

    effect(() => {
      const id = this.shell.listCursorId();
      if (!id) return;
      afterNextRender(
        () => {
          const root = this.threadListEl()?.nativeElement;
          const row = root?.querySelector(
            `[data-thread-id="${CSS.escape(id)}"]`,
          );
          row?.scrollIntoView({ block: 'nearest' });
        },
        { injector: this.injector },
      );
    });
  }

  onSearchInput(event: Event): void {
    this.shell.setSearchQuery((event.target as HTMLInputElement).value);
  }

  onRowPointerDown(id: string, event: PointerEvent): void {
    // Left button only; modifiers use the existing click path.
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;

    this.dragState = {
      startId: id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      didDrag: false,
      lastId: id,
    };

    const list = this.threadListEl()?.nativeElement;
    list?.setPointerCapture?.(event.pointerId);
  }

  onListPointerMove(event: PointerEvent): void {
    const state = this.dragState;
    if (!state || event.pointerId !== state.pointerId) return;
    // Only while primary button held
    if ((event.buttons & 1) === 0) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    const moved = Math.hypot(dx, dy) >= DRAG_THRESHOLD_PX;

    const underId = this.threadIdFromPoint(event.clientX, event.clientY) ?? state.lastId;

    if (!state.didDrag) {
      if (!moved && underId === state.startId) return;
      // Enter drag-select mode: range from origin through current row
      state.didDrag = true;
      this.shell.setCheckedRange(state.startId, underId);
      state.lastId = underId;
    } else if (underId !== state.lastId) {
      this.shell.setCheckedRange(state.startId, underId);
      state.lastId = underId;
    }

    this.maybeAutoScroll(event.clientY);
  }

  onListPointerUp(event: PointerEvent): void {
    const state = this.dragState;
    if (!state || event.pointerId !== state.pointerId) return;

    if (state.didDrag) {
      this.suppressClick = true;
      // Keep multi-select; focus last row without clearing checks
      if (state.lastId) {
        void this.shell.selectThread(state.lastId);
      }
    }

    const list = this.threadListEl()?.nativeElement;
    try {
      list?.releasePointerCapture?.(event.pointerId);
    } catch {
      /* already released */
    }
    this.dragState = null;
  }

  onThreadClick(id: string, event: MouseEvent): void {
    if (this.suppressClick) {
      this.suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
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

  private threadIdFromPoint(clientX: number, clientY: number): string | null {
    const el = document.elementFromPoint(clientX, clientY);
    if (!el) return null;
    const row = el.closest('[data-thread-id]') as HTMLElement | null;
    return row?.dataset['threadId'] ?? null;
  }

  private maybeAutoScroll(clientY: number): void {
    const list = this.threadListEl()?.nativeElement;
    if (!list) return;
    const rect = list.getBoundingClientRect();
    if (clientY < rect.top + DRAG_SCROLL_EDGE_PX) {
      list.scrollTop -= DRAG_SCROLL_STEP_PX;
    } else if (clientY > rect.bottom - DRAG_SCROLL_EDGE_PX) {
      list.scrollTop += DRAG_SCROLL_STEP_PX;
    }
  }
}
