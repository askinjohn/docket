import { describe, expect, it, vi, beforeEach } from 'vitest';

import type { UiShellService } from '../core/ui-shell.service';
import { handleShellKeydown, resetGoChordForTests } from './shell-hotkeys';

function makeShell(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    composeOpen: () => false,
    replyOpen: () => false,
    commandPaletteOpen: () => false,
    helpOpen: () => false,
    aiInsightOpen: () => false,
    closeAiInsight: vi.fn(),
    closeReply: vi.fn(),
    imagePreview: () => null,
    attachmentPreview: () => null,
    closeImagePreview: vi.fn(),
    closeAttachmentPreview: vi.fn(),
    checkedCount: () => 0,
    selectedId: () => null,
    toggleCommandPalette: vi.fn(),
    sendCompose: vi.fn(),
    sendReply: vi.fn(),
    closeCompose: vi.fn(),
    clearChecked: vi.fn(),
    closeCommandPalette: vi.fn(),
    closeSettings: vi.fn(),
    workflowsOpen: () => false,
    closeWorkflows: vi.fn(),
    openSettings: vi.fn(),
    closeAccountMenu: vi.fn(),
    mailboxAskOpen: () => false,
    closeMailboxAsk: vi.fn(),
    workflowReportOpen: () => false,
    closeWorkflowReport: vi.fn(),
    isSplitLayout: () => true,
    backToList: vi.fn(),
    closeHelp: vi.fn(),
    toggleHelp: vi.fn(),
    openHelp: vi.fn(),
    focusSearch: vi.fn(),
    setMailView: vi.fn(),
    selectAllVisible: vi.fn(),
    selectNext: vi.fn(),
    selectPrevious: vi.fn(),
    openFocusedThread: vi.fn(),
    focusedThreadId: () => null,
    onThreadListClick: vi.fn(),
    openReply: vi.fn(),
    openReplyAll: vi.fn(),
    openCompose: vi.fn(),
    archiveSelected: vi.fn(),
    undoArchive: vi.fn(),
    toggleStarSelected: vi.fn(),
    markUnreadSelected: vi.fn(),
    ...overrides,
  } as unknown as UiShellService;
}

function key(key: string, opts: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    target: document.body,
    ...opts,
  } as unknown as KeyboardEvent;
}

describe('handleShellKeydown', () => {
  beforeEach(() => {
    resetGoChordForTests();
  });

  it('opens command palette on ⌘K', () => {
    const shell = makeShell();
    const event = key('k', { metaKey: true });
    expect(handleShellKeydown(event, shell)).toBe(true);
    expect(shell.toggleCommandPalette).toHaveBeenCalled();
  });

  it('opens settings on ⌘,', () => {
    const shell = makeShell();
    const event = key(',', { metaKey: true });
    expect(handleShellKeydown(event, shell)).toBe(true);
    expect(shell.openSettings).toHaveBeenCalled();
  });

  it('navigates with j/k', () => {
    const shell = makeShell();
    expect(handleShellKeydown(key('j'), shell)).toBe(true);
    expect(shell.selectNext).toHaveBeenCalled();
    expect(handleShellKeydown(key('k'), shell)).toBe(true);
    expect(shell.selectPrevious).toHaveBeenCalled();
  });

  it('navigates with arrow keys and opens with Enter', () => {
    const shell = makeShell();
    expect(handleShellKeydown(key('ArrowDown'), shell)).toBe(true);
    expect(shell.selectNext).toHaveBeenCalled();
    expect(handleShellKeydown(key('ArrowUp'), shell)).toBe(true);
    expect(shell.selectPrevious).toHaveBeenCalled();
    expect(handleShellKeydown(key('Enter'), shell)).toBe(true);
    expect(shell.openFocusedThread).toHaveBeenCalled();
    expect(handleShellKeydown(key('ArrowRight'), shell)).toBe(true);
    expect(shell.openFocusedThread).toHaveBeenCalledTimes(2);
  });

  it('does not open compose on ⌘C', () => {
    const shell = makeShell();
    const event = key('c', { metaKey: true });
    expect(handleShellKeydown(event, shell)).toBe(false);
    expect(shell.openCompose).not.toHaveBeenCalled();
  });

  it('opens compose on c without modifiers', () => {
    const shell = makeShell();
    expect(handleShellKeydown(key('c'), shell)).toBe(true);
    expect(shell.openCompose).toHaveBeenCalled();
  });

  it('opens reply all on a', () => {
    const shell = makeShell();
    expect(handleShellKeydown(key('a'), shell)).toBe(true);
    expect(shell.openReplyAll).toHaveBeenCalled();
  });

  it('archives with e and undoes with z', () => {
    const shell = makeShell();
    handleShellKeydown(key('e'), shell);
    expect(shell.archiveSelected).toHaveBeenCalled();
    handleShellKeydown(key('z'), shell);
    expect(shell.undoArchive).toHaveBeenCalled();
  });

  it('marks unread with u', () => {
    const shell = makeShell();
    handleShellKeydown(key('u'), shell);
    expect(shell.markUnreadSelected).toHaveBeenCalled();
  });

  it('focuses search with /', () => {
    const shell = makeShell();
    handleShellKeydown(key('/'), shell);
    expect(shell.focusSearch).toHaveBeenCalled();
  });

  it('opens help with ?', () => {
    const shell = makeShell();
    handleShellKeydown(key('?'), shell);
    expect(shell.toggleHelp).toHaveBeenCalled();
  });

  it('returns to the list on Esc in list-first layout', () => {
    const shell = makeShell({
      isSplitLayout: () => false,
      selectedId: () => 't1',
    });
    expect(handleShellKeydown(key('Escape'), shell)).toBe(true);
    expect(shell.backToList).toHaveBeenCalled();
  });

  it('handles g i / g s / g a go chords', () => {
    const shell = makeShell();
    handleShellKeydown(key('g'), shell);
    handleShellKeydown(key('i'), shell);
    expect(shell.setMailView).toHaveBeenCalledWith('inbox');

    handleShellKeydown(key('g'), shell);
    handleShellKeydown(key('s'), shell);
    expect(shell.setMailView).toHaveBeenCalledWith('starred');

    handleShellKeydown(key('g'), shell);
    handleShellKeydown(key('a'), shell);
    expect(shell.setMailView).toHaveBeenCalledWith('all');
  });

  it('ignores letter keys while typing in an input', () => {
    const shell = makeShell();
    const input = document.createElement('input');
    const event = key('j', { target: input });
    expect(handleShellKeydown(event, shell)).toBe(false);
    expect(shell.selectNext).not.toHaveBeenCalled();
  });

  it('still allows ⌘K while typing', () => {
    const shell = makeShell();
    const input = document.createElement('input');
    const event = key('k', { metaKey: true, target: input });
    expect(handleShellKeydown(event, shell)).toBe(true);
    expect(shell.toggleCommandPalette).toHaveBeenCalled();
  });
});
