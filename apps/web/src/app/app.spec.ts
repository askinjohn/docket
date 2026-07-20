import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { App } from './app';
import { UiShellService } from './core/ui-shell.service';

function mockShell() {
  return {
    phaseLabel: () => 'Local Mail',
    coreStatus: () => 'online-disconnected' as const,
    accountEmail: () => null,
    accounts: () => [],
    activeAccountId: () => null,
    isConnected: () => false,
    listLoading: () => false,
    detailLoading: () => false,
    syncing: () => false,
    sending: () => false,
    summaryBusy: () => false,
    aiBusy: () => false,
    statusMessage: () => null,
    undoAvailable: () => false,
    emptyInboxHint: () => 'Connect Gmail to load your inbox.',
    threads: () => [],
    selectedId: () => null,
    selectedThread: () => null,
    replyOpen: () => false,
    composeOpen: () => false,
    commandPaletteOpen: () => false,
    replyBody: () => '',
    composeTo: () => '',
    composeCc: () => '',
    composeSubject: () => '',
    composeBody: () => '',
    composeShowCc: () => false,
    showComposeCc: () => undefined,
    discardCompose: () => undefined,
    contactSuggestions: () => [],
    contactSuggestField: () => null,
    contactSuggestHighlight: () => 0,
    pickContactSuggestion: () => undefined,
    moveContactHighlight: () => undefined,
    clearContactSuggestions: () => undefined,
    searchQuery: () => '',
    mailView: () => 'inbox' as const,
    theme: () => ({ mode: 'dark', accent: '#7c6af7', density: 'comfortable' }),
    settingsOpen: () => false,
    accountMenuOpen: () => false,
    accentPresets: [],
    bootstrap: async () => undefined,
    selectThread: async () => undefined,
    selectNext: () => undefined,
    selectPrevious: () => undefined,
    openReply: () => undefined,
    closeReply: () => undefined,
    openCompose: () => undefined,
    closeCompose: () => undefined,
    setReplyBody: () => undefined,
    setComposeTo: () => undefined,
    setComposeSubject: () => undefined,
    setComposeBody: () => undefined,
    sendCompose: async () => undefined,
    sendReply: async () => undefined,
    archiveSelected: async () => undefined,
    undoArchive: async () => undefined,
    toggleStarSelected: async () => undefined,
    syncNow: async () => undefined,
    connectGmail: async () => undefined,
    toggleCommandPalette: () => undefined,
    closeCommandPalette: () => undefined,
    setSearchQuery: () => undefined,
    runSearch: async () => undefined,
    setMailView: async () => undefined,
    runDailySummary: async () => undefined,
    aiSummarizeSelected: async () => undefined,
    aiDraftSelected: async () => undefined,
    openAttachment: () => undefined,
    runPaletteCommand: () => undefined,
    toggleTheme: () => undefined,
    openSettings: () => undefined,
    closeSettings: () => undefined,
    toggleAccountMenu: () => undefined,
    closeAccountMenu: () => undefined,
    setThemeMode: () => undefined,
    setThemeAccent: () => undefined,
    setThemeDensity: () => undefined,
    addAccount: () => undefined,
    switchAccount: async () => undefined,
    removeActiveAccount: async () => undefined,
  };
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: UiShellService, useValue: mockShell() },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render Local Mail shell', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Local Mail');
    expect(compiled.textContent).toContain('Inbox');
  });
});
