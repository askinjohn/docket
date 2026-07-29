import { Component, inject } from '@angular/core';

import { UiShellService } from '../core/ui-shell.service';

@Component({
  selector: 'lm-settings-dialog',
  template: `
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

        <div>
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
      </div>
    }
  `,
})
export class SettingsDialog {
  protected readonly shell = inject(UiShellService);
  protected readonly modes = ['dark', 'light', 'system'] as const;
  protected readonly densities = ['comfortable', 'compact'] as const;

  onAccentColor(event: Event): void {
    this.shell.setThemeAccent((event.target as HTMLInputElement).value);
  }
}
