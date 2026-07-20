import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { App } from './app';
import { UiShellService } from './core/ui-shell.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: UiShellService,
          useValue: {
            phaseLabel: () => 'Phase 1 — Core + Gmail',
            coreStatus: () => 'online-disconnected',
            accountEmail: () => null,
            isConnected: () => false,
            listLoading: () => false,
            detailLoading: () => false,
            syncing: () => false,
            sending: () => false,
            statusMessage: () => null,
            emptyInboxHint: () => 'Connect Gmail to load your inbox.',
            threads: () => [],
            selectedId: () => null,
            selectedThread: () => null,
            replyOpen: () => false,
            composeOpen: () => false,
            commandPaletteOpen: () => false,
            replyBody: () => '',
            bootstrap: async () => undefined,
            selectThread: async () => undefined,
            selectNext: () => undefined,
            selectPrevious: () => undefined,
            openReply: () => undefined,
            closeReply: () => undefined,
            openCompose: () => undefined,
            closeCompose: () => undefined,
            setReplyBody: () => undefined,
            sendReply: async () => undefined,
            archiveSelected: async () => undefined,
            syncNow: async () => undefined,
            connectGmail: async () => undefined,
            toggleCommandPalette: () => undefined,
            closeCommandPalette: () => undefined,
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render Local Mail without demo mock mail', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Local Mail');
    expect(compiled.textContent).toContain('Inbox');
    expect(compiled.textContent).not.toContain('Alex Chen');
    expect(compiled.textContent).not.toContain('Demo');
  });
});
