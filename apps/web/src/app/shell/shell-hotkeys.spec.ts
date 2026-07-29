import { describe, expect, it, vi } from 'vitest';

import type { UiShellService } from '../core/ui-shell.service';
import { handleShellKeydown } from './shell-hotkeys';

function makeShell(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    composeOpen: () => false,
    replyOpen: () => false,
    commandPaletteOpen: () => false,
    checkedCount: () => 0,
    selectedId: () => null,
    toggleCommandPalette: vi.fn(),
    sendCompose: vi.fn(),
    sendReply: vi.fn(),
    closeCompose: vi.fn(),
    clearChecked: vi.fn(),
    closeCommandPalette: vi.fn(),
    closeSettings: vi.fn(),
    closeAccountMenu: vi.fn(),
    selectAllVisible: vi.fn(),
    selectNext: vi.fn(),
    selectPrevious: vi.fn(),
    onThreadListClick: vi.fn(),
    openReply: vi.fn(),
    openCompose: vi.fn(),
    archiveSelected: vi.fn(),
    undoArchive: vi.fn(),
    toggleStarSelected: vi.fn(),
    ...overrides,
  } as unknown as UiShellService;
}

function key(key: string, opts: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    preventDefault: vi.fn(),
    target: document.body,
    ...opts,
  } as unknown as KeyboardEvent;
}

describe('handleShellKeydown', () => {
  it('opens command palette on ⌘K', () => {
    const shell = makeShell();
    const event = key('k', { metaKey: true });
    expect(handleShellKeydown(event, shell)).toBe(true);
    expect(shell.toggleCommandPalette).toHaveBeenCalled();
  });

  it('navigates with j/k', () => {
    const shell = makeShell();
    expect(handleShellKeydown(key('j'), shell)).toBe(true);
    expect(shell.selectNext).toHaveBeenCalled();
    expect(handleShellKeydown(key('k'), shell)).toBe(true);
    expect(shell.selectPrevious).toHaveBeenCalled();
  });

  it('archives with e and undoes with z', () => {
    const shell = makeShell();
    handleShellKeydown(key('e'), shell);
    expect(shell.archiveSelected).toHaveBeenCalled();
    handleShellKeydown(key('z'), shell);
    expect(shell.undoArchive).toHaveBeenCalled();
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
