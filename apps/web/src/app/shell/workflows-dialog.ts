import {
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';

import type { Workflow } from '../core/mail-api.service';
import {
  CONFIG_FIELD_HELP,
  configJson,
  explainWorkflow,
  parseConfig,
  parseErrorMessage,
} from '../core/workflow-explain';
import { UiShellService } from '../core/ui-shell.service';

@Component({
  selector: 'lm-workflow-blueprint',
  template: `
    <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div>
        <h4
          class="m-0 mb-2 text-[0.7rem] font-semibold tracking-wide text-lm-muted uppercase"
        >
          How this runs
        </h4>
        <p class="m-0 text-[0.82rem] font-semibold text-lm-text">
          {{ preview().whenTitle }}
        </p>
        <p class="m-0 mt-0.5 text-[0.78rem] leading-relaxed text-lm-muted">
          {{ preview().whenBody }}
        </p>
        <p class="m-0 mt-2 text-[0.75rem] text-lm-text">
          Model: <span class="font-medium">{{ preview().modelLine }}</span>
        </p>
        <p class="m-0 text-[0.72rem] leading-relaxed text-lm-muted">
          {{ preview().modelNote }}
        </p>
        <p class="m-0 mt-2 text-[0.72rem] leading-relaxed text-lm-muted">
          {{ preview().logicNote }}
        </p>

        @for (w of preview().warnings; track w) {
          <p class="m-0 mt-2 text-[0.75rem] text-lm-danger">{{ w }}</p>
        }

        @for (rule of preview().rules; track rule.n) {
          <article
            class="mt-3 rounded-lg border border-lm-border/80 bg-lm-bg/60 px-3 py-2.5"
          >
            <div class="text-[0.72rem] font-semibold tracking-wide text-lm-muted uppercase">
              {{ rule.heading }}
            </div>
            <div class="mt-1.5 text-[0.7rem] font-medium text-lm-muted">
              Hints for the model
            </div>
            @if (rule.matchLines.length) {
              <ul class="m-0 mt-0.5 list-disc pl-4 text-[0.78rem] leading-relaxed text-lm-text">
                @for (line of rule.matchLines; track line) {
                  <li>{{ line }}</li>
                }
              </ul>
            } @else {
              <p class="m-0 mt-0.5 text-[0.78rem] leading-relaxed text-lm-muted">
                {{ rule.matchEmpty }}
              </p>
            }
            <div class="mt-1.5 text-[0.7rem] font-medium text-lm-muted">
              Extra meaning (optional)
            </div>
            @if (rule.judgeLine) {
              <p class="m-0 text-[0.78rem] leading-relaxed text-lm-text">
                {{ rule.judgeLine }}
              </p>
              @if (rule.judgeHelp) {
                <p class="m-0 text-[0.72rem] leading-relaxed text-lm-muted">
                  {{ rule.judgeHelp }}
                </p>
              }
            } @else {
              <p class="m-0 text-[0.78rem] leading-relaxed text-lm-muted">
                None — no extra model call for this rule.
              </p>
            }
            <div class="mt-1.5 text-[0.7rem] font-medium text-lm-muted">Then</div>
            <ul class="m-0 mt-0.5 list-disc pl-4 text-[0.78rem] leading-relaxed text-lm-text">
              @for (line of rule.actionLines; track line) {
                <li>{{ line }}</li>
              }
            </ul>
            @for (w of rule.warnings; track w) {
              <p class="m-0 mt-1.5 text-[0.75rem] text-lm-danger">{{ w }}</p>
            }
          </article>
        }
      </div>

      <div class="min-w-0">
        <label class="mb-1 block text-[0.7rem] font-semibold tracking-wide text-lm-muted uppercase"
          >Config JSON</label
        >
        <p class="m-0 mb-2 text-[0.72rem] leading-relaxed text-lm-muted">
          The compiler can get this wrong. Edit here, then apply/save. The explanation
          on the left updates as you type.
        </p>
        <textarea
          class="mb-2 min-h-56 w-full resize-y rounded-lg border border-lm-border bg-lm-bg px-3 py-2 font-mono text-[0.72rem] leading-relaxed text-lm-text outline-none focus:border-lm-accent/50"
          spellcheck="false"
          aria-label="Workflow config JSON"
          [value]="json()"
          (input)="onJson($event)"
        ></textarea>
        @if (parseHint()) {
          <p class="m-0 mb-2 text-[0.75rem] text-lm-danger">{{ parseHint() }}</p>
        }
        <details class="rounded-lg border border-lm-border/70 bg-lm-bg/40 px-3 py-2">
          <summary
            class="cursor-pointer text-[0.72rem] font-medium text-lm-text"
          >
            What each field means
          </summary>
          <dl class="m-0 mt-2">
            @for (row of fieldHelp; track row.key) {
              <dt class="mt-2 font-mono text-[0.68rem] text-lm-accent">
                {{ row.key }}
              </dt>
              <dd class="m-0 text-[0.72rem] leading-relaxed text-lm-muted">
                {{ row.meaning }}
              </dd>
            }
          </dl>
        </details>
      </div>
    </div>
    <ng-content />
  `,
})
export class WorkflowBlueprint {
  readonly workflow = input.required<Workflow>();
  readonly json = model.required<string>();
  readonly error = input<string | null>(null);
  protected readonly fieldHelp = CONFIG_FIELD_HELP;

  protected readonly live = computed(
    () => parseConfig(this.json(), this.workflow()) ?? this.workflow(),
  );
  protected readonly preview = computed(() => explainWorkflow(this.live()));
  protected readonly parseHint = computed(() => {
    if (parseConfig(this.json(), this.workflow())) return this.error();
    return parseErrorMessage(this.json()) || 'Invalid JSON';
  });

  onJson(event: Event): void {
    this.json.set((event.target as HTMLTextAreaElement).value);
  }
}

@Component({
  selector: 'lm-workflows-dialog',
  imports: [WorkflowBlueprint],
  template: `
    <section
      class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-lm-bg"
      aria-label="Workflows"
    >
        <header
          class="flex shrink-0 items-center justify-between border-b border-lm-border/80 px-6 py-4"
        >
          <div>
            <h2 class="m-0 text-lg font-semibold tracking-tight text-lm-text">
              Workflows
            </h2>
            <p class="mt-0.5 m-0 text-[0.78rem] text-lm-muted">
              Describe it in English. Suggest compiles the tools. On run, the model
              reads each mail and chooses those tools — keywords are hints, not a filter.
            </p>
          </div>
          <div class="flex items-center gap-1">
            <button
              type="button"
              class="cursor-pointer rounded-lg border border-lm-border bg-transparent px-2.5 py-1.5 text-[0.75rem] text-lm-text hover:bg-lm-hover"
              (click)="shell.openWorkflowActivity()"
            >
              Activity
            </button>
          </div>
        </header>

        <div class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          @if (shell.workflowJobs().length) {
            <section class="mb-6 rounded-xl border border-lm-border bg-lm-panel px-4 py-3">
              <h3
                class="m-0 mb-2 text-[0.7rem] font-semibold tracking-wide text-lm-muted uppercase"
              >
                What’s happening
              </h3>
              @for (job of shell.workflowJobs().slice(0, 4); track job.id) {
                <div class="mb-3 last:mb-0">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-sm font-semibold text-lm-text">{{
                      job.workflowName
                    }}</span>
                    <div class="flex items-center gap-1.5">
                      <span class="text-[0.68rem] uppercase text-lm-muted">{{
                        job.status === 'cancelled' ? 'stopped' : job.status
                      }}</span>
                      @if (job.status === 'queued' || job.status === 'running') {
                        <button
                          type="button"
                          class="cursor-pointer rounded-md border border-lm-border bg-transparent px-2 py-0.5 text-[0.7rem] text-lm-danger hover:bg-lm-hover"
                          (click)="shell.stopWorkflowJob(job.id)"
                        >
                          Stop
                        </button>
                      }
                    </div>
                  </div>
                  @if (job.status === 'running' && job.current) {
                    <p class="m-0 mt-1 text-[0.78rem] text-lm-text">
                      Local model choosing tools for
                      <span class="font-medium">{{ job.current.from }}</span>
                      — {{ job.current.subject }}
                    </p>
                    <p class="m-0 text-[0.7rem] text-lm-muted">
                      {{ job.scanned }}/{{ job.threadCount }} threads
                    </p>
                  }
                  @for (a of job.actions.slice(-8).reverse(); track $index) {
                    <p class="m-0 mt-0.5 text-[0.72rem] text-lm-muted">
                      {{ actionLine(a) }}
                    </p>
                  }
                  @if (job.status === 'done' && !job.actions.length) {
                    <p class="m-0 mt-1 text-[0.72rem] text-lm-muted">
                      Finished — no actions (nothing matched).
                    </p>
                  }
                  @if (job.status === 'cancelled') {
                    <p class="m-0 mt-1 text-[0.72rem] text-lm-muted">
                      Stopped
                      @if (job.actions.length) {
                        · {{ job.actions.length }} action(s) already applied
                      }
                    </p>
                  }
                  @if (job.output) {
                    <button
                      type="button"
                      class="mt-1 cursor-pointer border-0 bg-transparent p-0 text-[0.72rem] font-medium text-lm-accent hover:underline"
                      (click)="shell.openWorkflowReport(job)"
                    >
                      Open answer
                    </button>
                  }
                </div>
              }
            </section>
          }

          <section class="mb-6">
            <label class="mb-1 block text-[0.72rem] font-medium text-lm-muted"
              >What should happen?</label
            >
            <textarea
              class="mb-3 min-h-24 w-full resize-y rounded-lg border border-lm-border bg-lm-bg px-3 py-2 text-sm text-lm-text outline-none placeholder:text-lm-muted focus:border-lm-accent/50"
              placeholder="Every new mail: notify me if urgent. GitLab and leave requests go to a Noise label and leave Primary. Weekday 8am: triage latest."
              [value]="english()"
              (input)="onEnglish($event)"
            ></textarea>

            <div class="mb-3">
              <div class="mb-1.5 text-[0.72rem] font-medium text-lm-muted">Backend</div>
              <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Backend">
                @for (name of backendNames(); track name) {
                  <button
                    type="button"
                    role="radio"
                    class="cursor-pointer rounded-lg border px-3 py-1.5 text-sm capitalize transition"
                    [attr.aria-checked]="backend() === name"
                    [class.border-lm-accent]="backend() === name"
                    [class.bg-lm-accent/15]="backend() === name"
                    [class.font-semibold]="backend() === name"
                    [class.text-lm-text]="backend() === name"
                    [class.border-lm-border]="backend() !== name"
                    [class.text-lm-muted]="backend() !== name"
                    [class.hover:bg-lm-hover]="backend() !== name"
                    (click)="backend.set(name)"
                  >
                    {{ name }}
                  </button>
                }
              </div>
            </div>
            <div class="mb-3">
              <div class="mb-1.5 text-[0.72rem] font-medium text-lm-muted">Model</div>
              @if (modelChoices().length) {
                <div class="mb-2 flex flex-wrap gap-1.5">
                  @for (m of modelChoices(); track m) {
                    <button
                      type="button"
                      class="cursor-pointer rounded-lg border px-2.5 py-1 text-[0.78rem] transition"
                      [class.border-lm-accent]="model() === m"
                      [class.bg-lm-accent/15]="model() === m"
                      [class.text-lm-text]="model() === m"
                      [class.border-lm-border]="model() !== m"
                      [class.text-lm-muted]="model() !== m"
                      [class.hover:bg-lm-hover]="model() !== m"
                      (click)="model.set(m)"
                    >
                      {{ m }}
                    </button>
                  }
                </div>
              }
              <input
                type="text"
                class="w-full rounded-lg border border-lm-border bg-lm-bg px-3 py-2 text-sm text-lm-text outline-none placeholder:text-lm-muted focus:border-lm-accent/50"
                [value]="model()"
                (input)="onModel($event)"
                placeholder="or type a model name"
              />
            </div>

            <button
              type="button"
              class="cursor-pointer rounded-xl border-0 bg-lm-accent px-3 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-40"
              [disabled]="shell.workflowBusy() || !english().trim()"
              (click)="suggest()"
            >
              {{ shell.workflowBusy() ? 'Compiling…' : 'Suggest workflow' }}
            </button>
          </section>

          @if (shell.workflowDraft(); as draft) {
            <section
              class="mb-6 rounded-xl border border-lm-accent/40 bg-lm-accent/10 px-4 py-3"
            >
              <div class="mb-1 text-sm font-semibold text-lm-text">{{ draft.name }}</div>
              <p class="m-0 mb-3 text-[0.78rem] text-lm-muted">
                {{ draft.description || draft.english }}
              </p>
              <lm-workflow-blueprint
                [workflow]="draft"
                [(json)]="draftJson"
                [error]="jsonError()"
              >
                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="cursor-pointer rounded-lg border border-lm-border bg-transparent px-3 py-1.5 text-[0.8rem] text-lm-text hover:bg-lm-hover"
                    (click)="applyDraftJson(draft)"
                  >
                    Apply JSON
                  </button>
                  <button
                    type="button"
                    class="cursor-pointer rounded-lg border-0 bg-lm-accent px-3 py-1.5 text-[0.8rem] font-semibold text-white hover:brightness-110 disabled:opacity-40"
                    [disabled]="shell.workflowBusy()"
                    (click)="approveDraft(draft)"
                  >
                    Approve & enable
                  </button>
                  <button
                    type="button"
                    class="cursor-pointer rounded-lg border border-lm-border bg-transparent px-3 py-1.5 text-[0.8rem] text-lm-text hover:bg-lm-hover"
                    (click)="shell.workflowDraft.set(null)"
                  >
                    Discard
                  </button>
                </div>
              </lm-workflow-blueprint>
            </section>
          }

          <section class="mb-6">
            <h3
              class="mb-2 m-0 text-[0.7rem] font-semibold tracking-wide text-lm-muted uppercase"
            >
              Saved
            </h3>
            @for (wf of shell.workflows(); track wf.id) {
              <div class="mb-2 rounded-xl border border-lm-border px-3 py-2.5">
                <div class="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    class="min-w-0 flex-1 cursor-pointer rounded-md border-0 bg-transparent p-0 text-left hover:opacity-90"
                    [attr.aria-expanded]="openId() === wf.id"
                    [attr.aria-controls]="'wf-config-' + wf.id"
                    (click)="toggleOpen(wf)"
                  >
                    <div class="flex items-center gap-1.5">
                      <span
                        class="shrink-0 text-[0.7rem] text-lm-muted"
                        aria-hidden="true"
                        >{{ openId() === wf.id ? '▾' : '▸' }}</span
                      >
                      <span class="truncate text-sm font-semibold text-lm-text">{{
                        wf.name
                      }}</span>
                    </div>
                    <div class="truncate pl-4 text-[0.72rem] text-lm-muted">
                      {{ triggerLabel(wf.trigger.type) }}
                      @if (wf.trigger.expr) {
                        · {{ wf.trigger.expr }}
                      }
                      · {{ wf.model.model }}
                      @if (!wf.approved) {
                        · not approved
                      }
                    </div>
                  </button>
                  <button
                    type="button"
                    class="shrink-0 cursor-pointer rounded-md border border-lm-border px-2 py-1 text-[0.72rem] text-lm-text hover:bg-lm-hover disabled:opacity-40"
                    [disabled]="!wf.approved"
                    (click)="shell.setWorkflowEnabled(wf.id, !wf.enabled)"
                  >
                    {{ wf.enabled ? 'On' : 'Off' }}
                  </button>
                </div>
                <div class="mt-2 flex flex-wrap gap-1.5 pl-4">
                  <button
                    type="button"
                    class="cursor-pointer rounded-md border border-lm-border px-2 py-1 text-[0.72rem] text-lm-text hover:bg-lm-hover"
                    [attr.aria-expanded]="openId() === wf.id"
                    (click)="toggleOpen(wf)"
                  >
                    {{ openId() === wf.id ? 'Hide config' : 'How it runs' }}
                  </button>
                  <button
                    type="button"
                    class="cursor-pointer rounded-md border border-lm-border px-2 py-1 text-[0.72rem] text-lm-text hover:bg-lm-hover disabled:opacity-40"
                    [disabled]="shell.workflowBusy() || !wf.approved"
                    (click)="shell.runWorkflow(wf.id, true)"
                  >
                    Dry run
                  </button>
                  @if (shell.liveWorkflowJob(wf.id); as live) {
                    <button
                      type="button"
                      class="cursor-pointer rounded-md border border-lm-danger/50 px-2 py-1 text-[0.72rem] font-medium text-lm-danger hover:bg-lm-hover"
                      (click)="shell.stopWorkflow(wf.id)"
                    >
                      Stop
                    </button>
                  } @else {
                    <button
                      type="button"
                      class="cursor-pointer rounded-md border border-lm-border px-2 py-1 text-[0.72rem] text-lm-text hover:bg-lm-hover disabled:opacity-40"
                      [disabled]="shell.workflowBusy() || !wf.approved"
                      (click)="shell.runWorkflow(wf.id, false)"
                    >
                      Run now
                    </button>
                  }
                  <button
                    type="button"
                    class="cursor-pointer rounded-md border border-lm-border px-2 py-1 text-[0.72rem] text-lm-danger hover:bg-lm-hover"
                    (click)="shell.removeWorkflow(wf.id)"
                  >
                    Delete
                  </button>
                </div>
                @if (openId() === wf.id) {
                  <div class="mt-3" [id]="'wf-config-' + wf.id">
                    <lm-workflow-blueprint
                      [workflow]="wf"
                      [json]="jsonFor(wf)"
                      (jsonChange)="setJsonFor(wf, $event)"
                      [error]="editingId() === wf.id ? jsonError() : null"
                    >
                      <button
                        type="button"
                        class="mt-2 cursor-pointer rounded-md border-0 bg-lm-accent px-2 py-1 text-[0.72rem] font-semibold text-white hover:brightness-110 disabled:opacity-40"
                        [disabled]="shell.workflowBusy()"
                        (click)="saveEdit(wf)"
                      >
                        Save config
                      </button>
                    </lm-workflow-blueprint>
                  </div>
                }
                @if (wf.lastError) {
                  <p class="m-0 mt-1 text-[0.72rem] text-lm-danger">{{ wf.lastError }}</p>
                }
              </div>
            } @empty {
              <p class="m-0 text-[0.78rem] text-lm-muted">No workflows yet.</p>
            }
          </section>

          @if (shell.workflowRuns().length) {
            <section>
              <h3
                class="mb-2 m-0 text-[0.7rem] font-semibold tracking-wide text-lm-muted uppercase"
              >
                Recent runs
              </h3>
              @for (run of shell.workflowRuns().slice(0, 8); track run.id) {
                <p class="m-0 mb-1 text-[0.72rem] text-lm-muted">
                  {{ run.reason }}{{ run.dryRun ? ' dry-run' : '' }} ·
                  {{ run.actions.length }} action(s) · {{ run.at.slice(0, 16).replace('T', ' ') }}
                  @if (run.error) {
                    · {{ run.error }}
                  }
                </p>
              }
            </section>
          }
        </div>
    </section>
  `,
  styles: `
    :host {
      display: flex;
      min-width: 0;
      min-height: 0;
      height: 100%;
      flex-direction: column;
      overflow: hidden;
    }
  `,
})
export class WorkflowsDialog {
  protected readonly shell = inject(UiShellService);
  protected readonly english = signal('');
  protected readonly backend = signal('local');
  protected readonly model = signal('');
  protected readonly draftJson = signal('');
  protected readonly editJsonById = signal<Record<string, string>>({});
  protected readonly editingId = signal<string | null>(null);
  protected readonly openId = signal<string | null>(null);
  protected readonly jsonError = signal<string | null>(null);

  constructor() {
    const cfg = this.shell.aiConfig();
    const fallback =
      cfg?.roles['ask']?.model ||
      cfg?.roles['chat']?.model ||
      this.shell.aiStatus()?.model ||
      'qwen2.5:7b';
    this.model.set(fallback);
    const b = cfg?.roles['ask']?.backend || 'local';
    this.backend.set(b);
    effect(() => {
      const draft = this.shell.workflowDraft();
      if (draft) this.draftJson.set(configJson(draft));
    });
  }

  protected backendNames(): string[] {
    return Object.keys(this.shell.aiConfig()?.backends ?? { local: true });
  }

  onEnglish(event: Event): void {
    this.english.set((event.target as HTMLTextAreaElement).value);
  }

  protected modelChoices(): string[] {
    const listed = this.shell.aiStatus()?.models ?? [];
    const current = this.model().trim();
    if (current && !listed.includes(current)) return [current, ...listed];
    return listed;
  }

  onModel(event: Event): void {
    this.model.set((event.target as HTMLInputElement).value);
  }

  suggest(): void {
    this.jsonError.set(null);
    void this.shell.suggestWorkflow(
      this.english(),
      this.backend(),
      this.model(),
    );
  }

  jsonFor(wf: Workflow): string {
    return this.editJsonById()[wf.id] ?? configJson(wf);
  }

  toggleOpen(wf: Workflow): void {
    if (this.openId() === wf.id) {
      this.openId.set(null);
      return;
    }
    this.jsonError.set(null);
    this.openId.set(wf.id);
  }

  setJsonFor(wf: Workflow, raw: string): void {
    this.editingId.set(wf.id);
    this.editJsonById.update((m) => ({ ...m, [wf.id]: raw }));
  }

  applyDraftJson(draft: Workflow): void {
    const next = parseConfig(this.draftJson(), draft);
    if (!next) {
      this.jsonError.set('Invalid JSON — fix it before applying.');
      return;
    }
    this.jsonError.set(null);
    this.shell.applyWorkflowDraft(next);
    this.draftJson.set(configJson(next));
  }

  approveDraft(draft: Workflow): void {
    const next = parseConfig(this.draftJson(), draft);
    if (!next) {
      this.jsonError.set('Invalid JSON — apply a valid config first.');
      return;
    }
    this.jsonError.set(null);
    void this.shell.approveWorkflow(next);
  }

  saveEdit(wf: Workflow): void {
    const next = parseConfig(this.jsonFor(wf), wf);
    if (!next) {
      this.editingId.set(wf.id);
      this.jsonError.set('Invalid JSON — not saved.');
      return;
    }
    this.jsonError.set(null);
    this.editJsonById.update((m) => {
      const copy = { ...m };
      delete copy[wf.id];
      return copy;
    });
    void this.shell.saveWorkflowEdits(next);
  }

  actionLine(a: {
    action: string;
    detail?: string;
    from?: string;
    subject?: string;
  }): string {
    let verb = a.action;
    if (a.action === 'addLabel') verb = 'Label “' + (a.detail || '') + '”';
    if (a.action === 'archive' || a.action === 'removeFromInbox') verb = 'Leave inbox';
    if (a.action === 'star') verb = 'Star';
    if (a.action === 'notify') verb = 'Notify';
    const who = [a.from, a.subject].filter(Boolean).join(' — ');
    return who ? verb + ' · ' + who : verb;
  }

  triggerLabel(type: string): string {
    if (type === 'mail.received') return 'Each new mail';
    if (type === 'cron') return 'Schedule';
    return 'Manual';
  }
}
