import { Component, inject } from '@angular/core';

import { UiShellService } from '../core/ui-shell.service';

/**
 * Full-screen attachment viewer: images, PDFs, text; others get open/download.
 */
@Component({
  selector: 'lm-attachment-viewer',
  template: `
    @if (shell.attachmentPreview(); as p) {
      <div
        class="fixed inset-0 z-50 flex flex-col bg-black/80"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="'Viewing ' + p.name"
        (click)="shell.closeAttachmentPreview()"
      >
        <!-- Title bar -->
        <header
          class="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-black/40 px-4 py-3"
          (click)="$event.stopPropagation()"
        >
          <div class="min-w-0">
            <div class="truncate text-sm font-semibold text-white">{{ p.name }}</div>
            <div class="truncate text-[0.72rem] text-white/55">
              {{ p.kindLabel }}
              @if (p.sizeLabel) {
                · {{ p.sizeLabel }}
              }
            </div>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <a
              class="cursor-pointer rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-[0.8rem] text-white no-underline hover:bg-white/20"
              [href]="p.url + '?download=1'"
              target="_blank"
              rel="noopener"
              >Download</a
            >
            <a
              class="cursor-pointer rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-[0.8rem] text-white no-underline hover:bg-white/20"
              [href]="p.url"
              target="_blank"
              rel="noopener"
              >Open tab</a
            >
            <button
              type="button"
              class="cursor-pointer rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-[0.8rem] text-white hover:bg-white/20"
              (click)="shell.closeAttachmentPreview()"
            >
              Close
            </button>
          </div>
        </header>

        <!-- Body -->
        <div
          class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4"
          (click)="$event.stopPropagation()"
        >
          @switch (p.view) {
            @case ('image') {
              <img
                class="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                [src]="p.url"
                [alt]="p.name"
              />
            }
            @case ('pdf') {
              <iframe
                class="h-full min-h-[70vh] w-full max-w-5xl rounded-lg border-0 bg-white shadow-2xl"
                title="PDF preview"
                [src]="p.url"
              ></iframe>
            }
            @case ('text') {
              @if (p.textLoading) {
                <p class="text-sm text-white/70">Loading…</p>
              } @else if (p.textError) {
                <div class="max-w-md rounded-xl border border-white/20 bg-black/50 p-6 text-center">
                  <p class="m-0 text-sm text-white/80">{{ p.textError }}</p>
                  <a
                    class="mt-3 inline-block text-sm text-lm-accent-2"
                    [href]="p.url + '?download=1'"
                    target="_blank"
                    rel="noopener"
                    >Download file</a
                  >
                </div>
              } @else {
                <pre
                  class="max-h-full w-full max-w-4xl overflow-auto rounded-xl border border-white/15 bg-[#0f1117] p-4 text-left text-[0.85rem] leading-relaxed text-white/90 whitespace-pre-wrap break-words"
                  >{{ p.textContent }}</pre
                >
              }
            }
            @default {
              <div
                class="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-white/15 bg-black/50 px-8 py-10 text-center"
              >
                <span class="text-4xl" aria-hidden="true">{{ p.icon }}</span>
                <div>
                  <div class="text-base font-semibold text-white">{{ p.name }}</div>
                  <div class="mt-1 text-sm text-white/55">
                    {{ p.kindLabel }}
                    @if (p.sizeLabel) {
                      · {{ p.sizeLabel }}
                    }
                  </div>
                </div>
                <p class="m-0 text-[0.8rem] text-white/50">
                  Preview not available for this file type. Open in a new tab or download.
                </p>
                <div class="flex flex-wrap justify-center gap-2">
                  <a
                    class="cursor-pointer rounded-lg border-0 bg-lm-accent px-4 py-2 text-sm font-semibold text-white no-underline hover:brightness-110"
                    [href]="p.url"
                    target="_blank"
                    rel="noopener"
                    >Open</a
                  >
                  <a
                    class="cursor-pointer rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm text-white no-underline hover:bg-white/20"
                    [href]="p.url + '?download=1'"
                    target="_blank"
                    rel="noopener"
                    >Download</a
                  >
                </div>
              </div>
            }
          }
        </div>
      </div>
    }
  `,
})
export class AttachmentViewer {
  protected readonly shell = inject(UiShellService);
}
