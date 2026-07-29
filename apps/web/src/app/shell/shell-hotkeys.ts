import type { UiShellService } from '../core/ui-shell.service';

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
    if (shell.composeOpen()) {
      event.preventDefault();
      shell.closeCompose();
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
    return true;
  }

  if (typing || shell.commandPaletteOpen() || shell.composeOpen()) {
    return false;
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    shell.selectAllVisible();
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

  return false;
}
