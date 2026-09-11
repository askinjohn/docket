import { Component, effect, inject, signal } from '@angular/core';

import { REMOTE_IMAGES_OPTIONS, UI_LAYOUT_OPTIONS } from '../core/theme';
import { UiShellService } from '../core/ui-shell.service';

@Component({
  selector: 'lm-settings-dialog',
  template: `
    @if (shell.settingsOpen()) {
      <div
        class="fixed inset-0 z-[70] bg-black/55 backdrop-blur-[2px]"
        (click)="shell.closeSettings()"
      ></div>
      <div
        class="fixed top-1/2 left-1/2 z-[80] flex max-h-[min(92vh,720px)] w-[min(560px,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-lm-border bg-lm-panel shadow-2xl"
        role="dialog"
        aria-label="Settings"
        aria-modal="true"
      >
        <header
          class="flex shrink-0 items-center justify-between border-b border-lm-border/80 px-6 py-4"
        >
          <div>
            <h2 class="m-0 text-lg font-semibold tracking-tight text-lm-text">Settings</h2>
            <p class="mt-0.5 m-0 text-[0.78rem] text-lm-muted">
              Appearance, text, notifications, and privacy.
            </p>
          </div>
          <button
            type="button"
            class="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-xl leading-none text-lm-muted hover:bg-lm-hover hover:text-lm-text"
            (click)="shell.closeSettings()"
            aria-label="Close settings"
          >
            ×
          </button>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <section class="mb-7">
            <h3 class="mb-1 m-0 text-[0.7rem] font-semibold tracking-wide text-lm-muted uppercase">
              Appearance
            </h3>
            <p class="mb-3 m-0 text-[0.78rem] text-lm-muted">
              Theme, accent, and mailbox layout.
            </p>

            <div class="mb-4">
              <div class="mb-2 text-[0.72rem] font-medium text-lm-muted">Mode</div>
              <div class="grid grid-cols-3 gap-2">
                @for (m of modes; track m) {
                  <button
                    type="button"
                    class="cursor-pointer rounded-xl border px-3 py-2.5 text-sm capitalize transition"
                    [class.border-lm-accent]="shell.theme().mode === m"
                    [class.bg-lm-accent/15]="shell.theme().mode === m"
                    [class.font-semibold]="shell.theme().mode === m"
                    [class.text-lm-text]="shell.theme().mode === m"
                    [class.border-lm-border]="shell.theme().mode !== m"
                    [class.text-lm-muted]="shell.theme().mode !== m"
                    [class.hover:bg-lm-hover]="shell.theme().mode !== m"
                    (click)="shell.setThemeMode(m)"
                  >
                    {{ m }}
                  </button>
                }
              </div>
            </div>

            <div class="mb-4">
              <div class="mb-2 text-[0.72rem] font-medium text-lm-muted">Accent</div>
              <div class="flex flex-wrap items-center gap-2.5">
                @for (a of shell.accentPresets; track a.id) {
                  <button
                    type="button"
                    class="h-9 w-9 cursor-pointer rounded-full border-2 shadow-sm transition-transform hover:scale-110"
                    [class.border-lm-text]="shell.theme().accent === a.value"
                    [class.ring-2]="shell.theme().accent === a.value"
                    [class.ring-lm-accent/40]="shell.theme().accent === a.value"
                    [class.border-transparent]="shell.theme().accent !== a.value"
                    [style.background]="a.value"
                    [title]="a.label"
                    (click)="shell.setThemeAccent(a.value)"
                  ></button>
                }
                <label
                  class="flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-lm-border px-3 text-xs text-lm-muted hover:bg-lm-hover hover:text-lm-text"
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
              <div class="mb-2 text-[0.72rem] font-medium text-lm-muted">Density</div>
              <div class="grid grid-cols-2 gap-2">
                @for (d of densities; track d) {
                  <button
                    type="button"
                    class="cursor-pointer rounded-xl border px-3 py-2.5 text-sm capitalize transition"
                    [class.border-lm-accent]="shell.theme().density === d"
                    [class.bg-lm-accent/15]="shell.theme().density === d"
                    [class.font-semibold]="shell.theme().density === d"
                    [class.text-lm-text]="shell.theme().density === d"
                    [class.border-lm-border]="shell.theme().density !== d"
                    [class.text-lm-muted]="shell.theme().density !== d"
                    [class.hover:bg-lm-hover]="shell.theme().density !== d"
                    (click)="shell.setThemeDensity(d)"
                  >
                    {{ d }}
                  </button>
                }
              </div>
            </div>

            <div>
              <div class="mb-2 text-[0.72rem] font-medium text-lm-muted">Layout</div>
              <div class="flex flex-col gap-2" role="radiogroup" aria-label="Mailbox layout">
                @for (opt of layoutOptions; track opt.id) {
                  <button
                    type="button"
                    role="radio"
                    class="cursor-pointer rounded-xl border px-4 py-3 text-left transition"
                    [attr.aria-checked]="shell.theme().uiLayout === opt.id"
                    [class.border-lm-accent]="shell.theme().uiLayout === opt.id"
                    [class.bg-lm-accent/10]="shell.theme().uiLayout === opt.id"
                    [class.border-lm-border]="shell.theme().uiLayout !== opt.id"
                    [class.hover:bg-lm-hover]="shell.theme().uiLayout !== opt.id"
                    (click)="shell.setUiLayout(opt.id)"
                  >
                    <span class="block text-sm font-semibold text-lm-text">{{
                      opt.label
                    }}</span>
                    <span class="mt-0.5 block text-[0.75rem] leading-snug text-lm-muted">{{
                      opt.description
                    }}</span>
                  </button>
                }
              </div>
            </div>
          </section>

          <section class="mb-7 border-t border-lm-border/60 pt-6">
            <h3 class="mb-1 m-0 text-[0.7rem] font-semibold tracking-wide text-lm-muted uppercase">
              Text
            </h3>
            <p class="mb-3 m-0 text-[0.78rem] text-lm-muted">
              Font and size for the shell and chat (HTML emails keep their own fonts).
            </p>

            <div class="mb-4">
              <div class="mb-2 text-[0.72rem] font-medium text-lm-muted">Font</div>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                @for (f of shell.fontFamilyOptions; track f.id) {
                  <button
                    type="button"
                    class="cursor-pointer rounded-xl border px-3 py-2.5 text-sm transition"
                    [style.font-family]="f.stack"
                    [class.border-lm-accent]="shell.theme().fontFamily === f.id"
                    [class.bg-lm-accent/15]="shell.theme().fontFamily === f.id"
                    [class.font-semibold]="shell.theme().fontFamily === f.id"
                    [class.border-lm-border]="shell.theme().fontFamily !== f.id"
                    [class.text-lm-muted]="shell.theme().fontFamily !== f.id"
                    [class.hover:bg-lm-hover]="shell.theme().fontFamily !== f.id"
                    (click)="shell.setFontFamily(f.id)"
                  >
                    {{ f.label }}
                  </button>
                }
              </div>
            </div>

            <div>
              <div class="mb-2 text-[0.72rem] font-medium text-lm-muted">Size</div>
              <div class="grid grid-cols-4 gap-2">
                @for (s of shell.fontSizeOptions; track s.id) {
                  <button
                    type="button"
                    class="cursor-pointer rounded-xl border px-2 py-2.5 transition"
                    [style.font-size.rem]="0.75 * s.scale + 0.15"
                    [class.border-lm-accent]="shell.theme().fontSize === s.id"
                    [class.bg-lm-accent/15]="shell.theme().fontSize === s.id"
                    [class.font-semibold]="shell.theme().fontSize === s.id"
                    [class.border-lm-border]="shell.theme().fontSize !== s.id"
                    [class.text-lm-muted]="shell.theme().fontSize !== s.id"
                    [class.hover:bg-lm-hover]="shell.theme().fontSize !== s.id"
                    (click)="shell.setFontSize(s.id)"
                    [title]="s.label"
                  >
                    {{ s.label }}
                  </button>
                }
              </div>
              <p
                class="mt-3 m-0 rounded-lg border border-lm-border/70 bg-lm-bg/40 px-3 py-2 text-lm-text"
                [style.font-family]="previewFontStack()"
              >
                Preview — The quick brown fox jumps over the lazy inbox.
              </p>
            </div>
          </section>

          <section class="mb-7 border-t border-lm-border/60 pt-6">
            <h3 class="mb-1 m-0 text-[0.7rem] font-semibold tracking-wide text-lm-muted uppercase">
              Notifications
            </h3>
            <p class="mb-3 m-0 text-[0.78rem] leading-relaxed text-lm-muted">
              New mail: core watches Gmail every 30s. You get an in-app toast only
              while Docket is in front. No Mac banners when the window is hidden
              or quit (⌘Q). Test still sends a system banner.
            </p>
            <p class="mb-3 m-0 rounded-lg border border-lm-border/70 bg-lm-bg/40 px-3 py-2 text-[0.8rem] text-lm-text">
              {{ shell.notifyStatus()?.label ?? 'Checking permission…' }}
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="cursor-pointer rounded-xl border border-lm-border bg-transparent px-3 py-2 text-sm text-lm-text hover:bg-lm-hover"
                (click)="shell.refreshNotifyStatus()"
              >
                Refresh status
              </button>
              <button
                type="button"
                class="cursor-pointer rounded-xl border-0 bg-lm-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
                (click)="shell.testNotification()"
              >
                Test notification
              </button>
            </div>
            <p class="mt-2 m-0 text-[0.72rem] leading-relaxed text-lm-muted">
              Live new-mail alerts are the toast in the corner, not Notification Center.
              Test still uses a system banner: System Settings → Notifications → Docket
              (or Script Editor in tauri dev) → Banners on.
            </p>
          </section>

          <section class="mb-7 border-t border-lm-border/60 pt-6">
            <h3 class="mb-1 m-0 text-[0.7rem] font-semibold tracking-wide text-lm-muted uppercase">
              Workflows
            </h3>
            <p class="mb-3 m-0 text-[0.78rem] leading-relaxed text-lm-muted">
              English → suggested plan (you pick the model) → approve. Runs on new mail,
              on a cron, or when you tap Run now.
            </p>
            <button
              type="button"
              class="cursor-pointer rounded-xl border-0 bg-lm-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
              (click)="shell.openWorkflows()"
            >
              Open workflows
            </button>
          </section>

          <section class="mb-7 border-t border-lm-border/60 pt-6">
            <h3 class="mb-1 m-0 text-[0.7rem] font-semibold tracking-wide text-lm-muted uppercase">
              AI
            </h3>
            <p class="mb-3 m-0 text-[0.78rem] leading-relaxed text-lm-muted">
              Grist-style JSON: each job picks a backend + model.
              File:
              <code class="break-all text-lm-text">{{
                shell.aiConfig()?.path || '~/.docket/ai-config.json'
              }}</code>
            </p>
            <p class="mb-3 m-0 text-[0.78rem] text-lm-muted">
              @if (shell.aiStatus(); as s) {
                @if (s.ollamaReachable) {
                  Ollama reachable · {{ s.models.length }} model(s)
                } @else {
                  Ollama not running at {{ s.ollamaBaseUrl }}
                }
              }
              @if (shell.aiStatus()?.hint) {
                — {{ shell.aiStatus()!.hint }}
              }
            </p>

            @if (shell.aiConfig(); as cfg) {
              <div class="mb-4 flex flex-col gap-3">
                @for (role of cfg.roleMeta; track role.id) {
                  <div class="rounded-lg border border-lm-border/70 px-3 py-2.5">
                    <div class="text-sm font-semibold text-lm-text">{{ role.label }}</div>
                    <div class="mb-2 text-[0.72rem] text-lm-muted">{{ role.help }}</div>
                    <div class="flex flex-col gap-2">
                      <div>
                        <div class="mb-1 text-[0.72rem] text-lm-muted">Backend</div>
                        <div class="flex flex-wrap gap-1.5">
                          @for (name of backendNames(); track name) {
                            <button
                              type="button"
                              class="cursor-pointer rounded-lg border px-2.5 py-1 text-[0.78rem] capitalize transition"
                              [class.border-lm-accent]="
                                (cfg.roles[role.id]?.backend ?? 'local') === name
                              "
                              [class.bg-lm-accent/15]="
                                (cfg.roles[role.id]?.backend ?? 'local') === name
                              "
                              [class.text-lm-text]="
                                (cfg.roles[role.id]?.backend ?? 'local') === name
                              "
                              [class.border-lm-border]="
                                (cfg.roles[role.id]?.backend ?? 'local') !== name
                              "
                              [class.text-lm-muted]="
                                (cfg.roles[role.id]?.backend ?? 'local') !== name
                              "
                              (click)="shell.setAiRole(role.id, { backend: name })"
                            >
                              {{ name }}
                            </button>
                          }
                        </div>
                      </div>
                      <label class="flex min-w-0 flex-col gap-1 text-[0.72rem] text-lm-muted">
                        Model
                        <input
                          type="text"
                          list="lm-ollama-models"
                          class="rounded-lg border border-lm-border bg-lm-bg px-3 py-2 text-sm text-lm-text outline-none focus:border-lm-accent/50"
                          [value]="cfg.roles[role.id]?.model ?? ''"
                          (change)="onRoleModel(role.id, $event)"
                        />
                      </label>
                    </div>
                  </div>
                }
              </div>
              <datalist id="lm-ollama-models">
                @for (m of shell.aiStatus()?.models ?? []; track m) {
                  <option [value]="m"></option>
                }
              </datalist>
            }

            <label class="mb-2 block text-[0.72rem] font-medium text-lm-muted">
              ai-config.json
            </label>
            <textarea
              class="mb-2 min-h-36 w-full resize-y rounded-lg border border-lm-border bg-lm-bg px-3 py-2 font-mono text-[0.75rem] leading-relaxed text-lm-text outline-none"
              [value]="jsonDraft()"
              (input)="onJsonInput($event)"
            ></textarea>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                class="cursor-pointer rounded-xl border-0 bg-lm-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
                (click)="saveJson()"
                [disabled]="shell.aiConfigSaving()"
              >
                Save JSON
              </button>
              <button
                type="button"
                class="cursor-pointer rounded-xl border border-lm-border bg-transparent px-3 py-2 text-sm text-lm-text hover:bg-lm-hover"
                (click)="shell.refreshAiStatus()"
              >
                Reload
              </button>
            </div>
          </section>

          <section class="border-t border-lm-border/60 pt-6">
            <h3 class="mb-1 m-0 text-[0.7rem] font-semibold tracking-wide text-lm-muted uppercase">
              Privacy · remote images
            </h3>
            <p class="mb-3 m-0 text-[0.78rem] leading-relaxed text-lm-muted">
              CDN images in HTML mail can track opens. Gmail attachments and inline (cid) images
              still load when remote images are blocked.
            </p>
            <div class="flex flex-col gap-2" role="radiogroup" aria-label="Remote images">
              @for (opt of remoteImageOptions; track opt.id) {
                <button
                  type="button"
                  role="radio"
                  class="cursor-pointer rounded-xl border px-4 py-3 text-left transition"
                  [attr.aria-checked]="(shell.theme().remoteImagesMode ?? 'ask') === opt.id"
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
                  <span class="block text-sm font-semibold text-lm-text">{{ opt.label }}</span>
                  <span class="mt-0.5 block text-[0.75rem] leading-snug text-lm-muted">{{
                    opt.description
                  }}</span>
                </button>
              }
            </div>
          </section>
        </div>

        <footer
          class="flex shrink-0 items-center justify-end border-t border-lm-border/80 px-6 py-3"
        >
          <button
            type="button"
            class="cursor-pointer rounded-xl border-0 bg-lm-accent px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
            (click)="shell.closeSettings()"
          >
            Done
          </button>
        </footer>
      </div>
    }
  `,
})
export class SettingsDialog {
  protected readonly shell = inject(UiShellService);
  protected readonly modes = ['dark', 'light', 'system'] as const;
  protected readonly densities = ['comfortable', 'compact'] as const;
  protected readonly remoteImageOptions = REMOTE_IMAGES_OPTIONS;
  protected readonly layoutOptions = UI_LAYOUT_OPTIONS;
  protected readonly jsonDraft = signal('');

  constructor() {
    effect(() => {
      const cfg = this.shell.aiConfig();
      if (!cfg) return;
      this.jsonDraft.set(
        JSON.stringify(
          { version: cfg.version, backends: cfg.backends, roles: cfg.roles },
          null,
          2,
        ),
      );
    });
  }

  protected backendNames(): string[] {
    return Object.keys(this.shell.aiConfig()?.backends ?? { local: true });
  }

  onRoleBackend(roleId: string, event: Event): void {
    this.shell.setAiRole(roleId, {
      backend: (event.target as HTMLSelectElement).value,
    });
  }

  onRoleModel(roleId: string, event: Event): void {
    this.shell.setAiRole(roleId, {
      model: (event.target as HTMLInputElement).value,
    });
  }

  onJsonInput(event: Event): void {
    this.jsonDraft.set((event.target as HTMLTextAreaElement).value);
  }

  saveJson(): void {
    try {
      const parsed = JSON.parse(this.jsonDraft()) as {
        backends?: Record<string, { type: string; baseURL: string }>;
        roles?: Record<string, { backend: string; model: string }>;
      };
      if (!parsed.backends || !parsed.roles) {
        this.shell.statusMessage.set('JSON needs backends and roles');
        return;
      }
      void this.shell.saveAiConfig({
        backends: parsed.backends as never,
        roles: parsed.roles,
      });
    } catch {
      this.shell.statusMessage.set('Invalid JSON');
    }
  }

  onAccentColor(event: Event): void {
    this.shell.setThemeAccent((event.target as HTMLInputElement).value);
  }

  previewFontStack(): string {
    const id = this.shell.theme().fontFamily;
    return (
      this.shell.fontFamilyOptions.find((f) => f.id === id)?.stack ??
      this.shell.fontFamilyOptions[0]!.stack
    );
  }
}
