import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
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
            coreStatus: () => 'offline',
            accountEmail: () => null,
            usingDemo: () => true,
            listLoading: () => false,
            detailLoading: () => false,
            syncing: () => false,
            sending: () => false,
            statusMessage: () => 'Core offline',
            threads: () => [
              {
                id: 'demo-1',
                from: 'Alex',
                subject: 'Hello',
                snippet: 'Hi',
                time: 'Now',
                unread: true,
                messages: [
                  {
                    id: 'm1',
                    from: 'Alex',
                    to: 'you',
                    time: 'Now',
                    body: 'Body',
                    attachments: [
                      {
                        id: 'a1',
                        name: 'file.pdf',
                        sizeLabel: '1 KB',
                        kind: 'pdf',
                      },
                    ],
                  },
                ],
              },
            ],
            selectedId: () => 'demo-1',
            selectedThread: () => ({
              id: 'demo-1',
              from: 'Alex',
              subject: 'Hello',
              snippet: 'Hi',
              time: 'Now',
              unread: true,
              messages: [
                {
                  id: 'm1',
                  from: 'Alex',
                  to: 'you',
                  time: 'Now',
                  body: 'Body',
                  attachments: [
                    {
                      id: 'a1',
                      name: 'file.pdf',
                      sizeLabel: '1 KB',
                      kind: 'pdf',
                    },
                  ],
                },
              ],
            }),
            replyOpen: () => true,
            composeOpen: () => false,
            commandPaletteOpen: () => false,
            replyBody: () => '',
            composeAttachments: () => [],
            bootstrap: async () => undefined,
            selectThread: async () => undefined,
            selectNext: () => undefined,
            selectPrevious: () => undefined,
            openReply: () => undefined,
            closeReply: () => undefined,
            openCompose: () => undefined,
            closeCompose: () => undefined,
            setReplyBody: () => undefined,
            removeComposeAttachment: () => undefined,
            addMockAttachment: () => undefined,
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

  it('should render Local Mail shell', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Local Mail');
    expect(compiled.textContent).toContain('Inbox');
    expect(compiled.textContent).toContain('Attachments');
  });
});
