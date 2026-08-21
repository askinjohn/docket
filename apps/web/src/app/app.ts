import { Component, inject, OnInit } from '@angular/core';

import { UiShellService } from './core/ui-shell.service';
import { AttachmentViewer } from './shell/attachment-viewer';
import { AuthGate } from './shell/auth-gate';
import { NotifyToast } from './shell/notify-toast';
import { CommandPalette } from './shell/command-palette';
import { ComposeWindow } from './shell/compose-window';
import { ReadingPane } from './shell/reading-pane';
import { handleShellKeydown } from './shell/shell-hotkeys';
import { SettingsDialog } from './shell/settings-dialog';
import { ShortcutsHelp } from './shell/shortcuts-help';
import { ContextRail } from './shell/context-rail';
import { Sidebar } from './shell/sidebar';
import { ThreadList } from './shell/thread-list';
import { WorkflowActivity } from './shell/workflow-activity';
import { WorkflowReport } from './shell/workflow-report';
import { WorkflowsDialog } from './shell/workflows-dialog';

/**
 * Root shell: layout chrome, global hotkeys, and overlay hosts.
 * Pane UI lives under `./shell/*`.
 */
@Component({
  selector: 'lm-root',
  imports: [
    Sidebar,
    ThreadList,
    ReadingPane,
    ContextRail,
    CommandPalette,
    SettingsDialog,
    WorkflowsDialog,
    WorkflowReport,
    WorkflowActivity,
    ShortcutsHelp,
    ComposeWindow,
    AttachmentViewer,
    AuthGate,
    NotifyToast,
  ],
  template: `
    <div
      class="grid h-full max-h-dvh overflow-hidden bg-lm-bg text-lm-text"
      [class.lm-shell-split]="shell.shellSection() === 'mail' && shell.isSplitLayout()"
      [class.lm-shell-list]="shell.shellSection() !== 'mail' || !shell.isSplitLayout()"
      [class.lm-has-report]="shell.workflowReportOpen()"
    >
      <lm-sidebar />
      @if (shell.showWorkflowsPage()) {
        <lm-workflows-dialog />
      }
      @if (shell.showThreadList()) {
        <lm-thread-list />
      }
      @if (shell.showReadingPane()) {
        <lm-reading-pane />
      }
      @if (shell.workflowReportOpen()) {
        <lm-workflow-report />
      }
    </div>

    @if (shell.mailboxAskOpen()) {
      <div
        class="fixed inset-0 z-[55] bg-black/35"
        (click)="shell.closeMailboxAsk()"
      ></div>
      <lm-context-rail />
    }

    <lm-notify-toast />
    <lm-auth-gate />
    <lm-command-palette />
    <lm-settings-dialog />
    <lm-workflow-activity />
    <lm-shortcuts-help />
    <lm-compose-window />
    <lm-attachment-viewer />
  `,
  styles: `
    :host {
      display: block;
      height: 100dvh;
      max-height: 100dvh;
      overflow: hidden;
      font-family: var(--font-lm);
    }

    .lm-shell-split {
      grid-template-columns: 188px minmax(260px, 318px) minmax(0, 1fr);
    }

    .lm-shell-list {
      grid-template-columns: 188px minmax(0, 1fr);
    }

    .lm-shell-split.lm-has-report {
      grid-template-columns: 188px minmax(220px, 280px) minmax(0, 1fr) minmax(280px, 380px);
    }

    .lm-shell-list.lm-has-report {
      grid-template-columns: 188px minmax(0, 1fr) minmax(280px, 380px);
    }
  `,
  host: {
    '(document:keydown)': 'onKeydown($event)',
    '(window:focus)': 'onWindowFocus()',
  },
})
export class App implements OnInit {
  protected readonly shell = inject(UiShellService);

  ngOnInit(): void {
    void this.shell.bootstrap();
  }

  onKeydown(event: KeyboardEvent): void {
    handleShellKeydown(event, this.shell);
  }

  onWindowFocus(): void {
    this.shell.fetchNewMailNow('window-focus');
  }
}
