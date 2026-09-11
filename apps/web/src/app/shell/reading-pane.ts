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
  countForwardedItems,
  splitForwardedMail,
  type ForwardedView,
} from '../core/forwarded-mail';
import {
  splitQuotedMail,
  type QuotedView,
} from '../core/quoted-mail';
import {
  chatBodyMode,
  iconForAttachment,
  isMine,
  messageDisplayName,
  messagePlainText,
  messageUsesHtml,
  type ChatBodyMode,
} from '../core/message-display';
import { SafeChatHtmlPipe } from '../core/safe-chat-html.pipe';
import { SafeSrcdocPipe } from '../core/safe-srcdoc.pipe';

import type { ShellMessage } from '../core/ui-shell.service';
import { UiShellService } from '../core/ui-shell.service';
import { AiInsightPanel } from './ai-insight-panel';
import { ReplyPanel } from './reply-panel';

@Component({
  selector: 'lm-reading-pane',
  imports: [SafeSrcdocPipe, SafeChatHtmlPipe, AiInsightPanel, ReplyPanel],
  template: `
    <section
      class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-lm-bg"
      aria-label="Reading pane"
    >
      @if (shell.selectedThread(); as thread) {
        <header class="shrink-0 border-b border-lm-border px-6 py-4">
          <div class="flex items-start justify-between gap-4">
            <div class="min-w-0">
              @if (!shell.isSplitLayout()) {
                <button
                  type="button"
                  class="mb-2 cursor-pointer border-0 bg-transparent p-0 text-[0.78rem] font-medium text-lm-muted hover:text-lm-text"
                  (click)="shell.backToList()"
                  title="Back to list (Esc)"
                >
                  ← Inbox
                </button>
              }
              <h2 class="lm-display m-0 text-[1.28rem] font-medium tracking-tight break-words">
                {{ thread.subject }}
              </h2>
              <div class="mt-2 flex flex-col gap-0.5 text-[0.78rem] leading-snug" aria-label="Message headers">
                <div class="min-w-0">
                  <span class="inline-block w-10 shrink-0 text-lm-muted">From</span>
                  <span class="text-lm-text">{{ headerFrom(thread) }}</span>
                </div>
                <div class="min-w-0">
                  <span class="inline-block w-10 shrink-0 text-lm-muted">To</span>
                  <span class="text-lm-text">{{ headerTo(thread) }}</span>
                </div>
                @if (headerCc(thread)) {
                  <div class="min-w-0">
                    <span class="inline-block w-10 shrink-0 text-lm-muted">Cc</span>
                    <span class="text-lm-text">{{ headerCc(thread) }}</span>
                  </div>
                }
                @if (headerBcc(thread)) {
                  <div class="min-w-0">
                    <span class="inline-block w-10 shrink-0 text-lm-muted">Bcc</span>
                    <span class="text-lm-text">{{ headerBcc(thread) }}</span>
                  </div>
                }
              </div>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                @if (shell.detailLoading()) {
                  <span class="text-[0.75rem] text-lm-muted">Loading…</span>
                }
                <div
                  class="inline-flex overflow-hidden rounded-lg border border-lm-border"
                  role="group"
                  aria-label="Message display mode"
                >
                  <button
                    type="button"
                    class="cursor-pointer border-0 px-2.5 py-1 text-[0.75rem] font-medium transition"
                    [class.bg-lm-accent]="threadViewMode(thread.id) === 'plain'"
                    [class.text-white]="threadViewMode(thread.id) === 'plain'"
                    [class.bg-transparent]="threadViewMode(thread.id) !== 'plain'"
                    [class.text-lm-muted]="threadViewMode(thread.id) !== 'plain'"
                    (click)="setThreadViewMode(thread.id, 'plain')"
                    title="Chat-style text (default)"
                  >
                    Plain
                  </button>
                  <button
                    type="button"
                    class="cursor-pointer border-0 border-l border-lm-border px-2.5 py-1 text-[0.75rem] font-medium transition"
                    [class.bg-lm-accent]="threadViewMode(thread.id) === 'html'"
                    [class.text-white]="threadViewMode(thread.id) === 'html'"
                    [class.bg-transparent]="threadViewMode(thread.id) !== 'html'"
                    [class.text-lm-muted]="threadViewMode(thread.id) !== 'html'"
                    (click)="setThreadViewMode(thread.id, 'html')"
                    title="Original HTML layout (tables, images, branding)"
                  >
                    Full email
                  </button>
                </div>
              </div>
            </div>
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
                class="cursor-pointer rounded-lg border border-lm-border bg-transparent px-2.5 py-1.5 text-[0.8rem] text-lm-text hover:bg-lm-hover"
                (click)="shell.toggleMailboxAsk()"
                title="Ask about your mailbox"
              >
                Ask AI
              </button>
              <button
                type="button"
                class="cursor-pointer rounded-lg border border-lm-border bg-transparent px-2.5 py-1.5 text-[0.8rem] text-lm-text hover:bg-lm-hover disabled:opacity-40"
                (click)="shell.aiSummarizeSelected()"
                [disabled]="!shell.isConnected() || shell.aiBusy()"
                title="AI summarize"
              >
                {{ shell.aiBusy() ? 'Summarizing…' : 'Summarize' }}
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
                (click)="replyHere(undefined, false)"
                title="Reply (r)"
              >
                Reply
              </button>
              <button
                type="button"
                class="cursor-pointer rounded-lg border border-lm-accent/50 bg-lm-accent/10 px-2.5 py-1.5 text-[0.8rem] font-medium text-lm-text hover:bg-lm-accent/20"
                (click)="replyHere(undefined, true)"
                title="Reply all (a)"
              >
                Reply all
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

        <div class="lm-read-body">
          <div class="lm-read-main">
        <div
          #readingScroll
          class="chat-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-5 sm:px-6"
          (scroll)="onReadingScroll()"
        >
          @if (shell.detailLoading() && thread.messages.length === 0) {
            <div class="flex w-full flex-col gap-3" aria-busy="true">
              <div class="h-16 w-3/4 max-w-md animate-pulse rounded-2xl bg-lm-panel"></div>
              <div class="ml-auto h-14 w-2/3 max-w-md animate-pulse rounded-2xl bg-lm-accent/15"></div>
              <p class="text-sm text-lm-muted">Loading conversation…</p>
            </div>
          }

          <!-- Minimal chat: plain stays bubble-width; rich/iframe use more of the pane. -->
          <div class="chat-thread flex w-full flex-col gap-2.5">
            @for (msg of thread.messages; track msg.id) {
              <div
                class="chat-row group flex w-full"
                [class.justify-start]="!mine(msg) || bodyMode(msg) === 'iframe'"
                [class.justify-end]="mine(msg) && bodyMode(msg) !== 'iframe'"
              >
                <div
                  class="flex min-w-0 flex-col"
                  [class.chat-col-plain]="bodyMode(msg) === 'plain'"
                  [class.chat-col-rich]="bodyMode(msg) === 'rich'"
                  [class.chat-col-iframe]="bodyMode(msg) === 'iframe'"
                  [class.items-end]="mine(msg) && bodyMode(msg) !== 'iframe'"
                  [class.items-start]="!mine(msg) || bodyMode(msg) === 'iframe'"
                >
                  <div
                    class="chat-bubble min-w-0 max-w-full px-3.5 py-2.5"
                    [class.w-fit]="bodyMode(msg) === 'plain'"
                    [class.w-full]="bodyMode(msg) !== 'plain'"
                    [class.chat-bubble-mine]="mine(msg) && bodyMode(msg) !== 'iframe'"
                    [class.chat-bubble-theirs]="!mine(msg) || bodyMode(msg) === 'iframe'"
                    [class.chat-bubble-doc]="bodyMode(msg) === 'iframe'"
                    [title]="bubbleTitle(msg)"
                  >
                    <div class="mb-1.5 text-[0.72rem] leading-snug text-lm-muted">
                      <div class="truncate text-lm-text">
                        <span class="text-lm-muted">From</span>
                        {{ displayName(msg) }}
                      </div>
                      @if (msg.to) {
                        <div class="truncate">
                          <span class="text-lm-muted">To</span>
                          {{ msg.to }}
                        </div>
                      }
                      @if (msg.cc) {
                        <div class="truncate">
                          <span class="text-lm-muted">Cc</span>
                          {{ msg.cc }}
                        </div>
                      }
                      @if (msg.bcc) {
                        <div class="truncate">
                          <span class="text-lm-muted">Bcc</span>
                          {{ msg.bcc }}
                        </div>
                      }
                    </div>
                    @if (forwardedView(msg); as fwd) {
                      @if (fwd.intro) {
                        <div
                          class="chat-plain whitespace-pre-wrap text-[0.9375rem] leading-relaxed break-words text-lm-text"
                        >
                          {{ fwd.intro }}
                        </div>
                      }
                      <div class="mt-2 border-t border-white/10 pt-2">
                        <button
                          type="button"
                          class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border-0 bg-black/10 px-2 py-1.5 text-left text-[0.78rem] font-medium text-lm-text hover:bg-lm-hover"
                          [attr.aria-expanded]="isForwardedOpen(msg.id)"
                          (click)="toggleForwarded(msg.id)"
                        >
                          <span
                            >Forwarded messages ·
                            {{ countForwarded(fwd) }}</span
                          >
                          <span class="text-lm-muted" aria-hidden="true">{{
                            isForwardedOpen(msg.id) ? '▾' : '▸'
                          }}</span>
                        </button>
                        @if (isForwardedOpen(msg.id)) {
                          <div class="mt-2 flex flex-col gap-2" role="region">
                            @for (block of fwd.blocks; track $index) {
                              <div
                                class="rounded-md border border-white/10 bg-black/10 px-2.5 py-2"
                              >
                                @if (block.from) {
                                  <div class="truncate text-[0.72rem] text-lm-text">
                                    <span class="text-lm-muted">From</span>
                                    {{ block.from }}
                                  </div>
                                }
                                @if (block.to) {
                                  <div class="truncate text-[0.72rem] text-lm-muted">
                                    To {{ block.to }}
                                  </div>
                                }
                                @if (block.subject) {
                                  <div
                                    class="mt-0.5 text-[0.82rem] font-medium text-lm-text"
                                  >
                                    {{ block.subject }}
                                  </div>
                                }
                                @if (block.body) {
                                  <div
                                    class="mt-1 whitespace-pre-wrap text-[0.82rem] leading-snug text-lm-muted"
                                  >
                                    {{ block.body }}
                                  </div>
                                }
                              </div>
                            }
                            @if (fwd.images.length) {
                              <div class="flex flex-wrap gap-1">
                                @for (img of fwd.images; track img.id) {
                                  <button
                                    type="button"
                                    class="inline-flex max-w-44 cursor-pointer items-center gap-1 rounded-md bg-black/15 px-1.5 py-0.5 text-left text-[0.7rem] text-lm-text hover:bg-lm-hover"
                                    (click)="openForwardedImage(msg, img.id)"
                                    [title]="img.name"
                                  >
                                    <span aria-hidden="true">🖼️</span>
                                    <span class="min-w-0 truncate">{{
                                      img.name
                                    }}</span>
                                  </button>
                                }
                              </div>
                            }
                          </div>
                        }
                      </div>
                    } @else if (quotedView(msg); as quoted) {
                      @if (quoted.intro) {
                        <div
                          class="chat-plain whitespace-pre-wrap text-[0.9375rem] leading-relaxed break-words text-lm-text"
                        >
                          {{ quoted.intro }}
                        </div>
                      }
                      <div class="mt-2 border-t border-white/10 pt-2">
                        <button
                          type="button"
                          class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border-0 bg-black/10 px-2 py-1.5 text-left text-[0.78rem] font-medium text-lm-text hover:bg-lm-hover"
                          [attr.aria-expanded]="isForwardedOpen(msg.id)"
                          (click)="toggleForwarded(msg.id)"
                        >
                          <span
                            >Earlier messages ·
                            {{ quoted.blocks.length }}</span
                          >
                          <span class="text-lm-muted" aria-hidden="true">{{
                            isForwardedOpen(msg.id) ? '▾' : '▸'
                          }}</span>
                        </button>
                        @if (isForwardedOpen(msg.id)) {
                          <div class="mt-2 flex flex-col gap-2" role="region">
                            @for (block of quoted.blocks; track $index) {
                              <div
                                class="rounded-md border border-white/10 bg-black/10 px-2.5 py-2"
                              >
                                @if (block.from) {
                                  <div class="truncate text-[0.72rem] text-lm-text">
                                    <span class="text-lm-muted">From</span>
                                    {{ block.from }}
                                  </div>
                                }
                                @if (block.date) {
                                  <div class="truncate text-[0.72rem] text-lm-muted">
                                    {{ block.date }}
                                  </div>
                                }
                                @if (block.body) {
                                  <div
                                    class="mt-1 whitespace-pre-wrap text-[0.82rem] leading-snug text-lm-muted"
                                  >
                                    {{ block.body }}
                                  </div>
                                }
                              </div>
                            }
                          </div>
                        }
                      </div>
                    } @else {
                      @switch (bodyMode(msg)) {
                        @case ('plain') {
                          <div
                            class="chat-plain whitespace-pre-wrap text-[0.9375rem] leading-relaxed break-words text-lm-text"
                          >
                            {{ plainText(msg, false) }}
                          </div>
                        }
                        @case ('rich') {
                          <div
                            class="chat-rich text-[0.9375rem] leading-relaxed text-lm-text"
                            [innerHTML]="
                              msg.bodyHtml
                                | safeChatHtml
                                  : shell.blockRemoteImagesNow()
                                  : msg.attachments
                                  : true
                            "
                          ></div>
                        }
                        @default {
                          <div
                            class="message-html-wrap w-full min-w-0"
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
                                    : true
                                    : true
                              "
                              (load)="onHtmlFrameLoad($event, msg.id)"
                            ></iframe>
                          </div>
                          @if (htmlNeedsExpand(msg.id) && !isHtmlExpanded(msg.id)) {
                            <button
                              type="button"
                              class="mt-1 cursor-pointer border-0 bg-transparent p-0 text-[0.7rem] text-lm-muted opacity-0 transition group-hover:opacity-100 hover:text-lm-accent"
                              (click)="expandHtml(msg.id)"
                            >
                              Show more
                            </button>
                          }
                          @if (isHtmlExpanded(msg.id)) {
                            <button
                              type="button"
                              class="mt-1 cursor-pointer border-0 bg-transparent p-0 text-[0.7rem] text-lm-muted hover:text-lm-text"
                              (click)="collapseHtml(msg.id)"
                            >
                              Show less
                            </button>
                          }
                        }
                      }
                    }

                    @if (leftoverAttachments(msg).length) {
                      <div
                        class="mt-2 flex flex-wrap gap-1 border-t border-white/10 pt-2"
                        aria-label="Attachments"
                      >
                        @for (file of leftoverAttachments(msg); track file.id) {
                          <button
                            type="button"
                            class="inline-flex max-w-44 cursor-pointer items-center gap-1 rounded-md bg-black/15 px-1.5 py-0.5 text-left text-[0.7rem] text-lm-text hover:bg-lm-hover"
                            (click)="
                              shell.openAttachment(file.id, {
                                kind: file.kind,
                                name: file.name,
                                mimeType: file.mimeType,
                                sizeLabel: file.sizeLabel,
                              })
                            "
                            [title]="file.name"
                          >
                            <span aria-hidden="true">{{ iconFor(file.kind) }}</span>
                            <span class="min-w-0 truncate">{{ file.name }}</span>
                          </button>
                        }
                      </div>
                    }
                  </div>
                  <div
                    class="mt-0.5 flex flex-wrap items-center gap-2 px-1 opacity-0 transition group-hover:opacity-100"
                  >
                    <time class="text-[0.65rem] text-lm-muted/70"
                      >{{ msg.time }}</time
                    >
                    <button
                      type="button"
                      class="cursor-pointer border-0 bg-transparent p-0 text-[0.7rem] font-medium text-lm-accent hover:underline"
                      (click)="replyHere(msg.id, false)"
                    >
                      Reply
                    </button>
                    <button
                      type="button"
                      class="cursor-pointer border-0 bg-transparent p-0 text-[0.7rem] font-medium text-lm-accent hover:underline"
                      (click)="replyHere(msg.id, true)"
                    >
                      Reply all
                    </button>
                    <button
                      type="button"
                      class="cursor-pointer border-0 bg-transparent p-0 text-[0.7rem] font-medium text-lm-muted hover:text-lm-text"
                      (click)="replyHere(msg.id, false, true)"
                      title="Quote the selected text in your reply"
                    >
                      Quote selection
                    </button>
                  </div>
                </div>
              </div>
            } @empty {
              @if (!shell.detailLoading()) {
                <p class="py-2 text-sm text-lm-muted">No messages loaded for this thread.</p>
              }
            }
          </div>
        </div>

            <lm-reply-panel [replyTo]="replyLabel(thread)" />
            @if (!shell.replyOpen() && shell.isConnected()) {
              <div
                class="flex shrink-0 items-center gap-2 border-t border-lm-border bg-lm-panel px-5 py-2.5"
              >
                <button
                  type="button"
                  class="cursor-pointer rounded-lg border border-lm-border bg-transparent px-3 py-1.5 text-sm text-lm-text hover:bg-lm-hover"
                  (click)="replyHere(undefined, false)"
                >
                  Reply
                  <kbd class="ml-1 rounded border border-lm-border px-1 font-mono text-[0.7rem]"
                    >r</kbd
                  >
                </button>
                <button
                  type="button"
                  class="cursor-pointer rounded-lg border border-lm-accent/40 bg-lm-accent/10 px-3 py-1.5 text-sm font-medium text-lm-text hover:bg-lm-accent/20"
                  (click)="replyHere(undefined, true)"
                >
                  Reply all
                  <kbd class="ml-1 rounded border border-lm-border px-1 font-mono text-[0.7rem]"
                    >a</kbd
                  >
                </button>
                <span class="text-[0.72rem] text-lm-muted"
                  >Select text in the message, then Quote selection on hover.</span
                >
              </div>
            }
          </div>

          @if (shell.aiInsightOpen()) {
            <aside class="lm-read-ai" aria-label="AI summary">
              <lm-ai-insight-panel />
            </aside>
          }
        </div>
      } @else {
        <div class="m-auto text-sm text-lm-muted">{{ shell.emptyInboxHint() }}</div>
      }
    </section>
  `,
  host: {
    '[attr.data-layout]': 'shell.theme().uiLayout',
  },
  styles: `
    :host {
      display: flex;
      min-width: 0;
      min-height: 0;
      height: 100%;
      flex-direction: column;
      overflow: hidden;
    }

    .lm-read-body {
      display: grid;
      min-height: 0;
      flex: 1;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: minmax(0, 1fr);
    }

    .lm-read-main {
      display: flex;
      min-width: 0;
      min-height: 0;
      flex-direction: column;
      overflow: hidden;
    }

    .lm-read-ai {
      display: flex;
      width: min(380px, 38vw);
      min-width: 280px;
      min-height: 0;
      flex-direction: column;
      overflow: hidden;
      border-left: 1px solid var(--color-lm-border);
      background: var(--color-lm-panel);
    }

    .chat-bubble-theirs {
      border-radius: 4px 18px 18px 18px;
      background: color-mix(in srgb, var(--color-lm-panel) 92%, var(--color-lm-hover));
      border: 1px solid color-mix(in srgb, var(--color-lm-border) 80%, transparent);
      box-shadow: 0 1px 0 rgba(0, 0, 0, 0.12);
      text-align: left;
    }

    .chat-bubble-mine {
      border-radius: 18px 4px 18px 18px;
      background: color-mix(in srgb, var(--color-lm-accent) 22%, var(--color-lm-panel));
      border: 1px solid color-mix(in srgb, var(--color-lm-accent) 35%, transparent);
      box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
      text-align: left;
    }

    .chat-plain {
      text-align: left;
    }

    /* Width by content type — marketing HTML was stuck at ~32rem (half pane) */
    .chat-col-plain {
      max-width: min(92%, 32rem);
    }
    .chat-col-rich {
      width: 100%;
      max-width: min(96%, 44rem);
    }
    .chat-col-iframe {
      width: 100%;
      max-width: min(100%, 56rem);
    }

    .chat-bubble-doc {
      border-radius: 14px;
      padding: 0.5rem;
      background: color-mix(in srgb, var(--color-lm-panel) 96%, var(--color-lm-hover));
    }

    /* In-bubble rich HTML: code, tables, images (themed for dark chat) */
    .chat-rich {
      text-align: left;
      overflow-x: auto;
      max-width: 100%;
      word-break: break-word;
    }
    .chat-rich :where(p, ul, ol, pre, table, blockquote) {
      margin: 0 0 0.55em;
    }
    .chat-rich :where(p, ul, ol, pre, table, blockquote):last-child {
      margin-bottom: 0;
    }
    .chat-rich :where(ul, ol) {
      padding-left: 1.25rem;
    }
    .chat-rich a {
      color: var(--color-lm-accent);
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .chat-rich code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.84em;
      background: rgba(0, 0, 0, 0.28);
      padding: 0.12em 0.4em;
      border-radius: 4px;
    }
    .chat-rich pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.78rem;
      line-height: 1.45;
      background: rgba(0, 0, 0, 0.38);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 0.75rem 0.9rem;
      overflow-x: auto;
      max-width: 100%;
    }
    .chat-rich pre code {
      background: transparent;
      padding: 0;
      font-size: inherit;
      border-radius: 0;
    }
    .chat-rich table {
      border-collapse: collapse;
      font-size: 0.8rem;
      width: max-content;
      max-width: 100%;
    }
    .chat-rich th,
    .chat-rich td {
      border: 1px solid rgba(255, 255, 255, 0.12);
      padding: 0.35rem 0.55rem;
      text-align: left;
      vertical-align: top;
    }
    .chat-rich th {
      background: rgba(0, 0, 0, 0.22);
      font-weight: 600;
    }
    .chat-rich img {
      max-width: min(100%, 28rem);
      height: auto;
      border-radius: 8px;
      display: block;
      margin: 0.35rem 0;
    }
    .chat-rich blockquote {
      border-left: 3px solid rgba(255, 255, 255, 0.18);
      padding-left: 0.75rem;
      color: var(--color-lm-muted);
    }

    .message-html-wrap {
      /* Soft paper for full HTML emails — use most of the reading width */
      background: #fff;
      min-height: 8rem;
      max-height: min(72vh, 44rem);
      overflow-x: auto;
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
      border: 0;
      border-radius: 10px;
      width: 100%;
    }

    .message-html-wrap.is-expanded {
      max-height: none;
      overflow-x: auto;
      overflow-y: visible;
    }

    .message-html-frame {
      display: block;
      width: 100%;
      min-width: 0;
      min-height: 12rem;
      height: 16rem;
      border: 0;
      background: #fff;
      vertical-align: top;
      color-scheme: light;
      border-radius: 10px;
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
  /**
   * Per-thread display: plain chat (default) vs full HTML email.
   * Plain keeps clean bubbles; Full email restores rich/iframe layouts.
   */
  private readonly threadViewModes = signal<ReadonlyMap<string, 'plain' | 'html'>>(
    new Map(),
  );
  private readonly forwardedOpenIds = signal<ReadonlySet<string>>(new Set());

  /** Banner only in “ask” mode when this thread still blocks remote images. */
  protected readonly showRemoteImagesBanner = computed(() => {
    if (!this.shell.canUnlockRemoteImagesForThread()) return false;
    if (!this.shell.blockRemoteImagesNow()) return false;
    // Only relevant when viewing full HTML
    const thread = this.shell.selectedThread();
    if (!thread) return false;
    if (this.threadViewMode(thread.id) === 'plain') return false;
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
        this.forwardedOpenIds.set(new Set());
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

    // After closing full image / attachment viewer → top of reading pane
    effect(() => {
      const nonce = this.shell.scrollReadingToTopNonce();
      if (!nonce) return;
      afterNextRender(
        () => {
          this.scrollReadingToTop();
          requestAnimationFrame(() => this.scrollReadingToTop());
        },
        { injector: this.injector },
      );
    });
  }

  /** Jump to top of the thread (disables chat-style stick-to-bottom). */
  private scrollReadingToTop(): void {
    this.stickReadingToBottom = false;
    const el = this.readingScroll()?.nativeElement;
    if (!el) return;
    el.scrollTop = 0;
  }

  protected usesHtml(msg: ShellMessage): boolean {
    return messageUsesHtml(msg);
  }

  protected lastMsg(thread: { messages: ShellMessage[] }): ShellMessage | undefined {
    return thread.messages.at(-1);
  }

  protected headerFrom(thread: { from: string; messages: ShellMessage[] }): string {
    return this.lastMsg(thread)?.from || thread.from || '—';
  }

  protected headerTo(thread: { messages: ShellMessage[] }): string {
    return this.lastMsg(thread)?.to || '—';
  }

  protected headerCc(thread: { messages: ShellMessage[] }): string {
    return this.lastMsg(thread)?.cc || '';
  }

  protected headerBcc(thread: { messages: ShellMessage[] }): string {
    return this.lastMsg(thread)?.bcc || '';
  }

  protected replyHere(messageId: string | undefined, all: boolean, quote = false): void {
    const selected = quote ? (window.getSelection()?.toString() ?? '') : '';
    this.shell.openReply({
      all,
      messageId,
      quote: selected,
    });
  }

  protected replyLabel(thread: { from: string; messages: ShellMessage[] }): string {
    if (this.shell.replyAll()) return 'everyone on this message';
    const id = this.shell.replyToMessageId();
    const msg = thread.messages.find((m) => m.id === id) ?? this.lastMsg(thread);
    return msg?.from || thread.from;
  }

  protected mine(msg: ShellMessage): boolean {
    return isMine(msg, this.shell.accountEmail());
  }

  protected plainText(msg: ShellMessage, full = false): string {
    return messagePlainText(msg, { full });
  }

  /** Default plain; Full email uses auto rich/iframe detection. */
  protected threadViewMode(threadId: string): 'plain' | 'html' {
    return this.threadViewModes().get(threadId) ?? 'plain';
  }

  protected setThreadViewMode(threadId: string, mode: 'plain' | 'html'): void {
    const next = new Map(this.threadViewModes());
    next.set(threadId, mode);
    this.threadViewModes.set(next);
    // Reset expand state when switching modes
    this.htmlExpandedIds.set(new Set());
    this.htmlTallIds.set(new Set());
  }

  protected bodyMode(msg: ShellMessage): ChatBodyMode {
    const threadId = this.shell.selectedId();
    if (!threadId || this.threadViewMode(threadId) === 'plain') {
      return 'plain';
    }
    return chatBodyMode(msg);
  }

  protected displayName(msg: ShellMessage): string {
    return messageDisplayName(msg, this.shell.accountEmail());
  }

  protected bubbleTitle(msg: ShellMessage): string {
    const who = this.mine(msg)
      ? 'You'
      : messageDisplayName(msg, this.shell.accountEmail());
    return `${who} · ${msg.time}`;
  }

  protected iconFor(kind: string): string {
    return iconForAttachment(kind);
  }

  protected forwardedView(msg: ShellMessage): ForwardedView | null {
    return splitForwardedMail({
      subject: this.shell.selectedThread()?.subject ?? '',
      text: msg.body,
      html: msg.bodyHtml,
      attachments: msg.attachments,
    });
  }

  protected quotedView(msg: ShellMessage): QuotedView | null {
    if (this.forwardedView(msg)) return null;
    return splitQuotedMail({
      text: msg.body,
      html: msg.bodyHtml,
    });
  }

  protected countForwarded(view: ForwardedView): number {
    return countForwardedItems(view);
  }

  protected leftoverAttachments(msg: ShellMessage) {
    const fwd = this.forwardedView(msg);
    if (!fwd?.images.length) return msg.attachments;
    const hide = new Set(fwd.images.map((i) => i.id));
    return msg.attachments.filter((a) => !hide.has(a.id));
  }

  protected isForwardedOpen(msgId: string): boolean {
    return this.forwardedOpenIds().has(msgId);
  }

  protected toggleForwarded(msgId: string): void {
    const next = new Set(this.forwardedOpenIds());
    if (next.has(msgId)) next.delete(msgId);
    else next.add(msgId);
    this.forwardedOpenIds.set(next);
  }

  protected openForwardedImage(msg: ShellMessage, id: string): void {
    const file = msg.attachments.find((a) => a.id === id);
    if (!file) return;
    this.shell.openAttachment(file.id, {
      kind: file.kind,
      name: file.name,
      mimeType: file.mimeType,
      sizeLabel: file.sizeLabel,
    });
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
    // After collapsing “Show full message”, return to the top of the thread
    afterNextRender(
      () => {
        this.scrollReadingToTop();
        requestAnimationFrame(() => this.scrollReadingToTop());
      },
      { injector: this.injector },
    );
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

        // Marketing HTML: allow most of the viewport before “Show more”
        const capPx = Math.min(window.innerHeight * 0.72, 44 * 16);
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
