import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';

import { htmlHasRemoteImages } from '../core/email-body';
import {
  iconForAttachment,
  isMine,
  messagePlainText,
  messageUsesHtml,
} from '../core/message-display';
import { SafeSrcdocPipe } from '../core/safe-srcdoc.pipe';
import type { ShellMessage } from '../core/ui-shell.service';
import { UiShellService } from '../core/ui-shell.service';
import { AiInsightPanel } from './ai-insight-panel';
import { ReplyPanel } from './reply-panel';

@Component({
  selector: 'lm-reading-pane',
  imports: [SafeSrcdocPipe, AiInsightPanel, ReplyPanel],
  template: `
    <section
      class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-lm-bg"
      aria-label="Reading pane"
    >
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
                (click)="shell.markUnreadSelected()"
                title="Mark unread (u)"
                [disabled]="!shell.isConnected() || thread.unread"
              >
                Unread
              </button>
              <button
                type="button"
                class="cursor-pointer rounded-lg border border-lm-border bg-transparent px-2.5 py-1.5 text-[0.8rem] text-lm-text hover:bg-lm-hover disabled:opacity-40"
                (click)="shell.aiSummarizeSelected()"
                [disabled]="!shell.isConnected() || shell.aiBusy()"
                title="AI summarize"
              >
                {{ shell.aiBusy() ? '…' : 'Summarize' }}
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
          @if (showRemoteImagesBanner()) {
            <div
              class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-lm-border bg-lm-panel px-3 py-2 text-[0.8rem]"
              role="status"
            >
              <span class="min-w-0 text-lm-muted">
                Remote images blocked for this thread (privacy). Layout uses placeholders.
              </span>
              <div class="flex shrink-0 flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  class="cursor-pointer rounded-md border-0 bg-lm-accent px-2.5 py-1 text-[0.78rem] font-semibold text-white hover:brightness-110"
                  (click)="shell.showRemoteImagesForThread()"
                >
                  Show for this thread
                </button>
                <button
                  type="button"
                  class="cursor-pointer rounded-md border border-lm-border bg-transparent px-2 py-1 text-[0.75rem] text-lm-muted hover:bg-lm-hover hover:text-lm-text"
                  (click)="shell.setRemoteImagesMode('always')"
                  title="Load remote images in every email (Settings)"
                >
                  Always show
                </button>
              </div>
            </div>
          } @else if (
            (shell.theme().remoteImagesMode ?? 'ask') === 'ask' &&
            shell.remoteImagesUnlockedThreadId() === thread.id
          ) {
            <div
              class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-lm-border/80 bg-lm-bg px-3 py-2 text-[0.78rem] text-lm-muted"
            >
              <span>Remote images on for this thread only.</span>
              <button
                type="button"
                class="cursor-pointer rounded-md border border-lm-border bg-transparent px-2 py-1 text-[0.75rem] hover:bg-lm-hover"
                (click)="shell.hideRemoteImagesForThread()"
              >
                Block again
              </button>
            </div>
          }
        </header>

        <div
          class="flex min-h-0 flex-1"
          [class.flex-col]="shell.theme().replyDock === 'bottom'"
          [class.flex-row]="shell.theme().replyDock === 'right'"
        >
        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
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
            @if (usesHtml(msg) && !mine(msg)) {
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
                <div
                  class="message-html-wrap w-full bg-white"
                  [class.is-expanded]="isHtmlExpanded(msg.id)"
                  [attr.data-msg-id]="msg.id"
                >
                  <iframe
                    class="message-html-frame"
                    title="Message body"
                    sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                    [srcdoc]="
                      msg.bodyHtml
                        | safeSrcdoc
                          : shell.blockRemoteImagesNow()
                          : msg.attachments
                    "
                    (load)="onHtmlFrameLoad($event, msg.id)"
                  ></iframe>
                </div>
                @if (htmlNeedsExpand(msg.id) && !isHtmlExpanded(msg.id)) {
                  <button
                    type="button"
                    class="w-full cursor-pointer border-0 border-t border-lm-border bg-lm-bg/80 px-4 py-2 text-left text-[0.78rem] font-medium text-lm-accent hover:bg-lm-hover"
                    (click)="expandHtml(msg.id)"
                  >
                    Show full message ↓
                  </button>
                }
                @if (isHtmlExpanded(msg.id)) {
                  <button
                    type="button"
                    class="w-full cursor-pointer border-0 border-t border-lm-border bg-lm-bg/80 px-4 py-2 text-left text-[0.78rem] font-medium text-lm-muted hover:bg-lm-hover hover:text-lm-text"
                    (click)="collapseHtml(msg.id)"
                  >
                    Collapse message ↑
                  </button>
                }
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
                            (click)="
                              shell.openAttachment(file.id, {
                                kind: file.kind,
                                name: file.name,
                                mimeType: file.mimeType,
                                sizeLabel: file.sizeLabel,
                              })
                            "
                            title="View attachment"
                          >
                            @if (file.kind === 'image') {
                              <img
                                class="h-10 w-10 shrink-0 rounded object-cover bg-lm-hover"
                                [src]="shell.api.attachmentUrl(file.id)"
                                [alt]="file.name"
                                loading="lazy"
                              />
                            } @else {
                              <span aria-hidden="true">{{ iconFor(file.kind) }}</span>
                            }
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
                [class.justify-end]="mine(msg)"
                [class.justify-start]="!mine(msg)"
              >
                <article
                  class="overflow-hidden rounded-2xl border px-4 py-3.5 shadow-sm"
                  [class.max-w-xl]="mine(msg)"
                  [class.max-w-3xl]="!mine(msg)"
                  [class.w-full]="!mine(msg)"
                  [class.border-lm-border]="!mine(msg)"
                  [class.bg-lm-panel]="!mine(msg)"
                  [class.border-lm-accent/45]="mine(msg)"
                  [class.bg-lm-accent/15]="mine(msg)"
                >
                  <div class="mb-2 flex min-w-0 justify-between gap-4">
                    <div class="min-w-0 text-left">
                      <div class="text-sm font-semibold break-words">
                        @if (mine(msg)) {
                          You
                        } @else {
                          {{ msg.from }}
                        }
                      </div>
                      <div class="mt-0.5 text-xs text-lm-muted break-words">To: {{ msg.to }}</div>
                    </div>
                    <time class="shrink-0 text-xs text-lm-muted">{{ msg.time }}</time>
                  </div>

                  @if (usesHtml(msg)) {
                    <div
                      class="message-html-wrap w-full rounded-lg border border-lm-border bg-white"
                      [class.is-expanded]="isHtmlExpanded(msg.id)"
                      [attr.data-msg-id]="msg.id"
                    >
                      <iframe
                        class="message-html-frame"
                        title="Message body"
                        sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                        [srcdoc]="
                      msg.bodyHtml
                        | safeSrcdoc
                          : shell.blockRemoteImagesNow()
                          : msg.attachments
                    "
                        (load)="onHtmlFrameLoad($event, msg.id)"
                      ></iframe>
                    </div>
                    @if (htmlNeedsExpand(msg.id) && !isHtmlExpanded(msg.id)) {
                      <button
                        type="button"
                        class="mt-1 w-full cursor-pointer rounded-lg border-0 bg-transparent px-1 py-1 text-left text-[0.75rem] font-medium text-lm-accent hover:underline"
                        (click)="expandHtml(msg.id)"
                      >
                        Show full message ↓
                      </button>
                    }
                    @if (isHtmlExpanded(msg.id)) {
                      <button
                        type="button"
                        class="mt-1 w-full cursor-pointer rounded-lg border-0 bg-transparent px-1 py-1 text-left text-[0.75rem] font-medium text-lm-muted hover:text-lm-text"
                        (click)="collapseHtml(msg.id)"
                      >
                        Collapse ↑
                      </button>
                    }
                  } @else {
                    <div
                      class="max-w-full whitespace-pre-wrap text-left text-[0.92rem] leading-relaxed break-words text-lm-text"
                    >
                      {{ plainText(msg) }}
                    </div>
                  }

                  @if (msg.attachments.length) {
                    <div class="mt-3 border-t border-lm-border pt-3" aria-label="Attachments">
                      <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
                        @for (file of msg.attachments; track file.id) {
                          <li>
                            <button
                              type="button"
                              class="inline-flex max-w-60 cursor-pointer items-center gap-2 rounded-lg border border-lm-border bg-lm-bg px-2.5 py-1.5 text-left text-sm hover:border-lm-accent/45 hover:bg-lm-hover"
                              (click)="
                                shell.openAttachment(file.id, {
                                  kind: file.kind,
                                  name: file.name,
                                  mimeType: file.mimeType,
                                  sizeLabel: file.sizeLabel,
                                })
                              "
                              title="View attachment"
                            >
                              @if (file.kind === 'image') {
                                <img
                                  class="h-8 w-8 shrink-0 rounded object-cover"
                                  [src]="shell.api.attachmentUrl(file.id)"
                                  [alt]="file.name"
                                  loading="lazy"
                                />
                              } @else {
                                <span aria-hidden="true">{{ iconFor(file.kind) }}</span>
                              }
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

        @if (shell.theme().replyDock === 'bottom') {
          <div
            class="flex max-h-[min(52vh,440px)] min-h-0 shrink-0 flex-col overflow-hidden"
          >
            <lm-ai-insight-panel />
            <lm-reply-panel [replyTo]="thread.from" />
            @if (
              !shell.replyOpen() &&
              !shell.aiInsightOpen() &&
              shell.isConnected()
            ) {
              <button
                type="button"
                class="shrink-0 cursor-pointer border-0 border-t border-lm-border bg-lm-panel px-5 py-3.5 text-left text-sm text-lm-muted transition hover:bg-lm-hover hover:text-lm-text"
                (click)="shell.openReply()"
              >
                Reply to this thread ·
                <kbd
                  class="rounded border border-lm-border bg-lm-bg px-1.5 py-0.5 font-mono text-xs"
                  >r</kbd
                >
              </button>
            }
          </div>
        }
        </div>

        @if (shell.theme().replyDock === 'right') {
          <aside
            class="flex w-[min(400px,42%)] min-w-[280px] shrink-0 flex-col overflow-hidden border-l border-lm-border bg-lm-panel"
            aria-label="Side panels"
          >
            <lm-ai-insight-panel class="min-h-0 flex-1" />
            <lm-reply-panel class="min-h-0 flex-1" [replyTo]="thread.from" />
            @if (
              !shell.replyOpen() &&
              !shell.aiInsightOpen() &&
              shell.isConnected()
            ) {
              <button
                type="button"
                class="m-3 cursor-pointer rounded-lg border border-lm-border bg-lm-bg px-3 py-3 text-left text-sm text-lm-muted transition hover:bg-lm-hover hover:text-lm-text"
                (click)="shell.openReply()"
              >
                Reply · <kbd class="font-mono text-xs">r</kbd>
              </button>
            }
          </aside>
        }
        </div>
      } @else {
        <div class="m-auto text-sm text-lm-muted">{{ shell.emptyInboxHint() }}</div>
      }
    </section>
  `,
  styles: `
    :host {
      display: contents;
    }

    .message-html-wrap {
      background: #fff;
      min-height: 4rem;
      max-height: min(42vh, 26rem);
      overflow-x: hidden;
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }

    .message-html-wrap.is-expanded {
      max-height: none;
      overflow-y: visible;
    }

    .message-html-frame {
      display: block;
      width: 100%;
      min-height: 4rem;
      height: 12rem;
      border: 0;
      background: #fff;
      vertical-align: top;
    }

    .msg-incoming .message-html-frame {
      min-height: 5rem;
    }
  `,
})
export class ReadingPane {
  protected readonly shell = inject(UiShellService);
  private readonly injector = inject(Injector);

  private readonly readingScroll = viewChild<ElementRef<HTMLElement>>('readingScroll');
  private stickReadingToBottom = true;
  private lastReadingThreadId: string | null = null;
  private readonly htmlExpandedIds = signal<ReadonlySet<string>>(new Set());
  private readonly htmlTallIds = signal<ReadonlySet<string>>(new Set());

  /** Banner only in “ask” mode when this thread still blocks remote images. */
  protected readonly showRemoteImagesBanner = computed(() => {
    if (!this.shell.canUnlockRemoteImagesForThread()) return false;
    if (!this.shell.blockRemoteImagesNow()) return false;
    const thread = this.shell.selectedThread();
    if (!thread) return false;
    return thread.messages.some((m) => htmlHasRemoteImages(m.bodyHtml));
  });

  constructor() {
    effect(() => {
      const thread = this.shell.selectedThread();
      if (!thread) {
        this.lastReadingThreadId = null;
        return;
      }

      const isNewThread = thread.id !== this.lastReadingThreadId;
      if (isNewThread) {
        this.lastReadingThreadId = thread.id;
        this.stickReadingToBottom = true;
        this.htmlExpandedIds.set(new Set());
        this.htmlTallIds.set(new Set());
      }

      // Re-render srcdoc when remote-image unlock toggles
      void this.shell.blockRemoteImagesNow();

      void thread.messages.length;
      void thread.messages.at(-1)?.id;
      void this.shell.detailLoading();
      void this.shell.replyOpen();
      void this.shell.aiInsightOpen();

      // Close panels when switching threads
      if (isNewThread) {
        this.shell.closeAiInsight();
      }

      const force = isNewThread || this.stickReadingToBottom;

      afterNextRender(
        () => {
          this.scrollReadingToLatest(force);
          requestAnimationFrame(() => this.scrollReadingToLatest(force));
          window.setTimeout(() => this.scrollReadingToLatest(force), 80);
        },
        { injector: this.injector },
      );
    });
  }

  protected usesHtml(msg: ShellMessage): boolean {
    return messageUsesHtml(msg);
  }

  protected mine(msg: ShellMessage): boolean {
    return isMine(msg, this.shell.accountEmail());
  }

  protected plainText(msg: ShellMessage): string {
    return messagePlainText(msg);
  }

  protected iconFor(kind: string): string {
    return iconForAttachment(kind);
  }

  onReadingScroll(): void {
    const el = this.readingScroll()?.nativeElement;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.stickReadingToBottom = distanceFromBottom < 80;
  }

  private scrollReadingToLatest(force = false): void {
    if (!force && !this.stickReadingToBottom) return;
    const el = this.readingScroll()?.nativeElement;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    this.stickReadingToBottom = true;
  }

  isHtmlExpanded(msgId: string): boolean {
    return this.htmlExpandedIds().has(msgId);
  }

  htmlNeedsExpand(msgId: string): boolean {
    return this.htmlTallIds().has(msgId);
  }

  expandHtml(msgId: string): void {
    const next = new Set(this.htmlExpandedIds());
    next.add(msgId);
    this.htmlExpandedIds.set(next);
  }

  collapseHtml(msgId: string): void {
    const next = new Set(this.htmlExpandedIds());
    next.delete(msgId);
    this.htmlExpandedIds.set(next);
  }

  onHtmlFrameLoad(event: Event, msgId: string): void {
    const iframe = event.target as HTMLIFrameElement;

    const measure = (): void => {
      try {
        const doc = iframe.contentDocument;
        if (!doc?.body) {
          iframe.style.height = '8rem';
          return;
        }
        const h = Math.max(
          doc.body.scrollHeight,
          doc.body.offsetHeight,
          doc.documentElement?.scrollHeight ?? 0,
        );
        const measured = Math.max(h + 12, 64);
        iframe.style.height = `${measured}px`;

        const capPx = Math.min(window.innerHeight * 0.42, 26 * 16);
        this.setHtmlTall(msgId, measured > capPx + 8);
      } catch {
        iframe.style.height = '12rem';
      }

      this.maybeStickAfterLastFrame(iframe);
    };

    measure();
    requestAnimationFrame(measure);

    try {
      const doc = iframe.contentDocument;
      if (!doc) return;
      for (const img of Array.from(doc.images)) {
        if (!img.complete) {
          img.addEventListener('load', measure, { once: true });
          img.addEventListener('error', measure, { once: true });
        }
      }
      window.setTimeout(measure, 200);
    } catch {
      /* ignore */
    }
  }

  private setHtmlTall(msgId: string, tall: boolean): void {
    const cur = this.htmlTallIds();
    if (tall === cur.has(msgId)) return;
    const next = new Set(cur);
    if (tall) next.add(msgId);
    else next.delete(msgId);
    this.htmlTallIds.set(next);
  }

  private maybeStickAfterLastFrame(iframe: HTMLIFrameElement): void {
    if (!this.stickReadingToBottom) return;
    const root = this.readingScroll()?.nativeElement;
    if (!root) return;
    const frames = root.querySelectorAll('.message-html-frame');
    if (!frames.length || frames[frames.length - 1] !== iframe) return;
    requestAnimationFrame(() => this.scrollReadingToLatest(false));
  }

}
