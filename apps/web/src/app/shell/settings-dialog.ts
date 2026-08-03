import { Component, inject } from '@angular/core';

import { REMOTE_IMAGES_OPTIONS } from '../core/theme';
import { UiShellService } from '../core/ui-shell.service';

@Component({
  selector: 'lm-settings-dialog',
  template: `
    @if (shell.settingsOpen()) {
      <div class="fixed inset-0 z-40 bg-black/50" (click)="shell.closeSettings()"></div>
      <div
        class="fixed top-1/2 left-1/2 z-50 max-h-[min(90vh,640px)] w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-lm-border bg-lm-panel p-5 shadow-2xl"
        role="dialog"
        aria-label="Settings"
        aria-modal="true"
      >
        <div class="mb-4 flex items-center justify-between">
          <h2 class="m-0 text-base font-semibold">Settings</h2>
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
            @for (m of modes; track m) {
              <button
                type="button"
                class="flex-1 rounded-lg border px-2 py-2 text-sm capitalize"
                [class.border-lm-accent]="shell.theme().mode === m"
                [class.bg-lm-accent/15]="shell.theme().mode === m"
                [class.border-lm-border]="shell.theme().mode !== m"
                (click)="shell.setThemeMode(m)"
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

        <div class="mb-4">
          <div class="mb-2 text-xs font-medium tracking-wide text-lm-muted uppercase">Density</div>
          <div class="flex gap-2">
            @for (d of densities; track d) {
              <button
                type="button"
                class="flex-1 rounded-lg border px-2 py-2 text-sm capitalize"
                [class.border-lm-accent]="shell.theme().density === d"
                [class.bg-lm-accent/15]="shell.theme().density === d"
                [class.border-lm-border]="shell.theme().density !== d"
                (click)="shell.setThemeDensity(d)"
              >
                {{ d }}
              </button>
            }
          </div>
        </div>

        <div class="mb-4">
          <div class="mb-2 text-xs font-medium tracking-wide text-lm-muted uppercase">
            Reply panel
          </div>
          <div class="flex gap-2">
            @for (d of docks; track d) {
              <button
                type="button"
                class="flex-1 rounded-lg border px-2 py-2 text-sm capitalize"
                [class.border-lm-accent]="shell.theme().replyDock === d"
                [class.bg-lm-accent/15]="shell.theme().replyDock === d"
                [class.border-lm-border]="shell.theme().replyDock !== d"
                (click)="shell.setReplyDock(d)"
              >
                {{ d }}
              </button>
            }
          </div>
          <p class="mt-2 m-0 text-[0.72rem] text-lm-muted">
            Bottom under the thread, or right side of the reading pane.
          </p>
        </div>

        <div>
          <div class="mb-2 text-xs font-medium tracking-wide text-lm-muted uppercase">
            Remote images (CDN)
          </div>
          <p class="mb-2 m-0 text-[0.72rem] leading-relaxed text-lm-muted">
            External images can track opens. Attachments and inline Gmail images still work when
            blocked.
          </p>
          <div class="flex flex-col gap-2" role="radiogroup" aria-label="Remote images">
            @for (opt of remoteImageOptions; track opt.id) {
              <button
                type="button"
                role="radio"
                class="rounded-xl border px-3 py-2.5 text-left transition"
                [attr.aria-checked]="
                  (shell.theme().remoteImagesMode ?? 'ask') === opt.id
                "
                [class.border-lm-accent]="
                  (shell.theme().remoteImagesMode ?? 'ask') === opt.id
                "
                [class.bg-lm-accent/10]="
                  (shell.theme().remoteImagesMode ?? 'ask') === opt.id
                "
                [class.border-lm-border]="
                  (shell.theme().remoteImagesMode ?? 'ask') !== opt.id
                "
                [class.hover:bg-lm-hover]="
                  (shell.theme().remoteImagesMode ?? 'ask') !== opt.id
                "
                (click)="shell.setRemoteImagesMode(opt.id)"
              >
                <span class="block text-sm font-semibold text-lm-text">{{
                  opt.label
                }}</span>
                <span class="mt-0.5 block text-[0.72rem] leading-snug text-lm-muted">{{
                  opt.description
                }}</span>
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class SettingsDialog {
  protected readonly shell = inject(UiShellService);
  protected readonly modes = ['dark', 'light', 'system'] as const;
  protected readonly densities = ['comfortable', 'compact'] as const;
  protected readonly docks = ['bottom', 'right'] as const;
  protected readonly remoteImageOptions = REMOTE_IMAGES_OPTIONS;

  onAccentColor(event: Event): void {
    this.shell.setThemeAccent((event.target as HTMLInputElement).value);
  }
}
