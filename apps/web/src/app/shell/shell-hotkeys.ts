import type { UiShellService } from '../core/ui-shell.service';

/** Second key of a `g …` chord must arrive within this window. */
const GO_CHORD_MS = 900;
let goChordUntil = 0;

/** @internal test helper */
export function resetGoChordForTests(): void {
  goChordUntil = 0;
}

function armGoChord(): void {
  goChordUntil = Date.now() + GO_CHORD_MS;
}

function consumeGoChord(): boolean {
  if (Date.now() > goChordUntil) {
    goChordUntil = 0;
    return false;
  }
  goChordUntil = 0;
  return true;
}

/**
 * Global shell keyboard map (Superhuman-inspired).
 * Returns true when the event was handled (caller should not bubble further).
 */
export function handleShellKeydown(
  event: KeyboardEvent,
  shell: UiShellService,
): boolean {
  const target = event.target as HTMLElement | null;
  const typing =
    !!target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable);

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    shell.toggleCommandPalette();
    return true;
  }

  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    if (shell.composeOpen()) {
      event.preventDefault();
      void shell.sendCompose();
      return true;
    }
    if (shell.replyOpen()) {
      event.preventDefault();
      void shell.sendReply();
      return true;
    }
    return false;
  }

  if (event.key === 'Escape') {
    if (shell.attachmentPreview()) {
      event.preventDefault();
      shell.closeAttachmentPreview();
      return true;
    }
    if (shell.helpOpen()) {
      event.preventDefault();
      shell.closeHelp();
      return true;
    }
    if (shell.composeOpen()) {
      event.preventDefault();
      shell.closeCompose();
      return true;
    }
    if (shell.replyOpen()) {
      event.preventDefault();
      shell.closeReply();
      return true;
    }
    if (shell.aiInsightOpen()) {
      event.preventDefault();
      shell.closeAiInsight();
      return true;
    }
    if (shell.checkedCount() > 0) {
      event.preventDefault();
      shell.clearChecked();
      return true;
    }
    shell.closeCommandPalette();
    shell.closeSettings();
    shell.closeAccountMenu();
    goChordUntil = 0;
    return true;
  }

  // Allow `?` even when palette is open so users can jump to help — but not while typing.
  if (!typing && event.key === '?') {
    event.preventDefault();
    shell.toggleHelp();
    return true;
  }

  if (typing || shell.commandPaletteOpen() || shell.composeOpen() || shell.helpOpen()) {
    return false;
  }

  // `g` then i / s / a — go to view
  if (consumeGoChord()) {
    const k = event.key.toLowerCase();
    if (k === 'i') {
      event.preventDefault();
      void shell.setMailView('inbox');
      return true;
    }
    if (k === 's') {
      event.preventDefault();
      void shell.setMailView('starred');
      return true;
    }
    if (k === 'a') {
      event.preventDefault();
      void shell.setMailView('all');
      return true;
    }
    // Unknown second key — fall through so e.g. `g` then `j` still navigates
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    shell.selectAllVisible();
    return true;
  }

  if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    shell.focusSearch();
    return true;
  }

  if (event.key === 'g' && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    armGoChord();
    return true;
  }

  if (event.key === 'j') {
    event.preventDefault();
    shell.selectNext();
    return true;
  }
  if (event.key === 'k') {
    event.preventDefault();
    shell.selectPrevious();
    return true;
  }
  if (event.key === 'x') {
    event.preventDefault();
    const id = shell.selectedId();
    if (id) {
      void shell.onThreadListClick(id, {
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
      });
    }
    return true;
  }
  if (event.key === 'r') {
    event.preventDefault();
    shell.openReply();
    return true;
  }
  if (event.key === 'c') {
    event.preventDefault();
    shell.openCompose();
    return true;
  }
  if (event.key === 'e') {
    event.preventDefault();
    void shell.archiveSelected();
    return true;
  }
  if (event.key === 'z') {
    event.preventDefault();
    void shell.undoArchive();
    return true;
  }
  if (event.key === 's') {
    event.preventDefault();
    void shell.toggleStarSelected();
    return true;
  }
  if (event.key === 'u') {
    event.preventDefault();
    void shell.markUnreadSelected();
    return true;
  }

  return false;
}
