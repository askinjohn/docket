import { Service, computed, inject, signal } from '@angular/core';

import {
  MailApiService,
  type ApiThread,
  type ApiThreadDetail,
} from './mail-api.service';
import { openExternalUrl } from './open-external';

export interface ShellAttachment {
  id: string;
  name: string;
  sizeLabel: string;
  kind: 'pdf' | 'image' | 'doc' | 'other';
}

export interface ShellMessage {
  id: string;
  from: string;
  to: string;
  time: string;
  body: string;
  attachments: ShellAttachment[];
}

export interface ShellThreadPreview {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  time: string;
  unread: boolean;
  messages: ShellMessage[];
  hasAttachments?: boolean;
}

const DEMO_THREADS: ShellThreadPreview[] = [
  {
    id: 'demo-1',
    from: 'Alex Chen',
    subject: 'Q3 deck + invoice for review',
    snippet:
      'Attached the latest deck and the invoice PDF. Can you reply with sign-off?',
    time: '10:42',
    unread: true,
    hasAttachments: true,
    messages: [
      {
        id: 'm1',
        from: 'Alex Chen <alex@example.com>',
        to: 'you@gmail.com',
        time: 'Today 10:42',
        body: `Hi —\n\nAttached the latest Q3 deck and the vendor invoice.\nCould you reply with a quick sign-off by EOD?\n\nThanks,\nAlex`,
        attachments: [
          {
            id: 'a1',
            name: 'Q3-Product-Review.pdf',
            sizeLabel: '2.4 MB',
            kind: 'pdf',
          },
          {
            id: 'a2',
            name: 'invoice-8841.pdf',
            sizeLabel: '186 KB',
            kind: 'pdf',
          },
          {
            id: 'a3',
            name: 'chart-preview.png',
            sizeLabel: '420 KB',
            kind: 'image',
          },
        ],
      },
    ],
  },
  {
    id: 'demo-2',
    from: 'Local Mail',
    subject: 'Connect Gmail to load real mail',
    snippet: 'Start the core, add OAuth credentials, then Connect Gmail.',
    time: '—',
    unread: false,
    messages: [
      {
        id: 'm2',
        from: 'Local Mail <system@local>',
        to: 'you@gmail.com',
        time: 'Demo',
        body: 'Demo mode: core offline or not connected. See docs/GMAIL_SETUP.md.',
        attachments: [],
      },
    ],
  },
];

export type CoreStatus =
  | 'checking'
  | 'offline'
  | 'online-disconnected'
  | 'online-connected'
  | 'misconfigured';

@Service()
export class UiShellService {
  private readonly api = inject(MailApiService);

  readonly threads = signal<ShellThreadPreview[]>(DEMO_THREADS);
  readonly selectedId = signal<string | null>(DEMO_THREADS[0]?.id ?? null);
  readonly detailLoading = signal(false);
  readonly listLoading = signal(false);
  readonly syncing = signal(false);
  readonly sending = signal(false);
  readonly statusMessage = signal<string | null>(null);
  readonly commandPaletteOpen = signal(false);
  readonly replyOpen = signal(true);
  readonly composeOpen = signal(false);
  readonly replyBody = signal('');
  readonly composeAttachments = signal<
    { id: string; name: string; sizeLabel: string }[]
  >([]);
  readonly coreStatus = signal<CoreStatus>('checking');
  readonly accountEmail = signal<string | null>(null);
  readonly usingDemo = signal(true);
  readonly phaseLabel = signal('Phase 1 — Core + Gmail');

  readonly selectedThread = computed(() => {
    const id = this.selectedId();
    return this.threads().find((t) => t.id === id) ?? null;
  });

  readonly coreOnline = computed(() => {
    const s = this.coreStatus();
    return (
      s === 'online-connected' ||
      s === 'online-disconnected' ||
      s === 'misconfigured'
    );
  });

  async bootstrap(): Promise<void> {
    this.coreStatus.set('checking');
    try {
      const health = await this.api.health();
      if (!health.googleConfigured) {
        this.coreStatus.set('misconfigured');
        this.statusMessage.set(
          'Core is up. Add GOOGLE_CLIENT_ID / SECRET in apps/core/.env — see docs/GMAIL_SETUP.md',
        );
        this.usingDemo.set(true);
        this.threads.set(DEMO_THREADS);
        this.selectedId.set(DEMO_THREADS[0]?.id ?? null);
        return;
      }
      if (health.account?.email) {
        this.accountEmail.set(health.account.email);
        this.coreStatus.set('online-connected');
        await this.refreshThreads();
      } else {
        this.coreStatus.set('online-disconnected');
        this.accountEmail.set(null);
        this.usingDemo.set(true);
        this.threads.set(DEMO_THREADS);
        this.selectedId.set(DEMO_THREADS[0]?.id ?? null);
        this.statusMessage.set('Core online — connect Gmail to load your inbox.');
      }
    } catch {
      this.coreStatus.set('offline');
      this.usingDemo.set(true);
      this.threads.set(DEMO_THREADS);
      this.selectedId.set(DEMO_THREADS[0]?.id ?? null);
      this.statusMessage.set(
        'Core offline. Run: cd apps/core && npm run dev',
      );
    }
  }

  async refreshThreads(): Promise<void> {
    this.listLoading.set(true);
    try {
      const res = await this.api.listThreads();
      if (res.account?.email) {
        this.accountEmail.set(res.account.email);
      }
      if (!res.threads.length) {
        this.usingDemo.set(false);
        this.threads.set([]);
        this.selectedId.set(null);
        this.statusMessage.set('Inbox empty locally — try Sync.');
        return;
      }
      this.usingDemo.set(false);
      const mapped: ShellThreadPreview[] = res.threads.map((t: ApiThread) => ({
        id: t.id,
        from: t.from,
        subject: t.subject,
        snippet: t.snippet,
        time: t.time,
        unread: t.unread,
        hasAttachments: t.hasAttachments,
        messages: [],
      }));
      this.threads.set(mapped);
      const keep = mapped.find((t) => t.id === this.selectedId());
      const nextId = keep?.id ?? mapped[0]?.id ?? null;
      this.selectedId.set(nextId);
      if (nextId) {
        await this.loadThreadDetail(nextId);
      }
      this.statusMessage.set(null);
    } catch (e) {
      this.statusMessage.set(
        e instanceof Error ? e.message : 'Failed to load threads',
      );
    } finally {
      this.listLoading.set(false);
    }
  }

  async loadThreadDetail(id: string): Promise<void> {
    if (this.usingDemo() || id.startsWith('demo-')) {
      return;
    }
    this.detailLoading.set(true);
    try {
      const detail: ApiThreadDetail = await this.api.getThread(id);
      this.threads.update((list) =>
        list.map((t) =>
          t.id === id
            ? {
                ...t,
                subject: detail.subject,
                from: detail.from,
                time: detail.time,
                unread: detail.unread,
                messages: detail.messages.map((m) => ({
                  id: m.id,
                  from: m.from,
                  to: m.to,
                  time: m.time,
                  body: m.body,
                  attachments: m.attachments,
                })),
              }
            : t,
        ),
      );
      if (detail.unread) {
        void this.api.markRead(id).catch(() => undefined);
        this.threads.update((list) =>
          list.map((t) => (t.id === id ? { ...t, unread: false } : t)),
        );
      }
    } catch (e) {
      this.statusMessage.set(
        e instanceof Error ? e.message : 'Failed to load thread',
      );
    } finally {
      this.detailLoading.set(false);
    }
  }

  async selectThread(id: string): Promise<void> {
    this.selectedId.set(id);
    this.replyOpen.set(true);
    this.threads.update((list) =>
      list.map((t) => (t.id === id ? { ...t, unread: false } : t)),
    );
    await this.loadThreadDetail(id);
  }

  selectNext(): void {
    const list = this.threads();
    if (!list.length) return;
    const idx = list.findIndex((t) => t.id === this.selectedId());
    const next = list[Math.min(idx + 1, list.length - 1)];
    if (next) void this.selectThread(next.id);
  }

  selectPrevious(): void {
    const list = this.threads();
    if (!list.length) return;
    const idx = list.findIndex((t) => t.id === this.selectedId());
    const prev = list[Math.max(idx - 1, 0)];
    if (prev) void this.selectThread(prev.id);
  }

  /**
   * Opens Google OAuth in the **system browser** (Proton Pass / extensions work).
   * Polls core until tokens are saved, then refreshes inbox.
   */
  async connectGmail(): Promise<void> {
    if (this.coreStatus() === 'misconfigured') {
      this.statusMessage.set(
        'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to apps/core/.env first.',
      );
      return;
    }

    const url = this.api.gmailConnectUrl();
    this.statusMessage.set(
      'Opening your browser for Google sign-in… Finish there, then return here.',
    );

    try {
      await openExternalUrl(url);
    } catch (e) {
      this.statusMessage.set(
        e instanceof Error
          ? e.message
          : 'Could not open browser. Open this URL manually: ' + url,
      );
      return;
    }

    void this.waitForGmailAuth();
  }

  /** Poll /auth/status until connected or timeout. */
  private async waitForGmailAuth(): Promise<void> {
    const started = Date.now();
    const timeoutMs = 3 * 60 * 1000;

    while (Date.now() - started < timeoutMs) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const status = await this.api.authStatus();
        if (status.connected && status.email) {
          this.accountEmail.set(status.email);
          this.coreStatus.set('online-connected');
          this.statusMessage.set(
            `Connected as ${status.email}. Syncing inbox…`,
          );
          await this.syncNow();
          return;
        }
      } catch {
        // core briefly unavailable — keep waiting
      }
    }

    this.statusMessage.set(
      'Still waiting for Google sign-in. After you finish in the browser, click Sync inbox.',
    );
  }

  async syncNow(): Promise<void> {
    this.syncing.set(true);
    this.statusMessage.set('Syncing…');
    try {
      const res = await this.api.sync();
      this.statusMessage.set(`Synced ${res.synced} threads for ${res.email}`);
      await this.refreshThreads();
    } catch (e) {
      this.statusMessage.set(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      this.syncing.set(false);
    }
  }

  async archiveSelected(): Promise<void> {
    const id = this.selectedId();
    if (!id || this.usingDemo()) {
      this.statusMessage.set('Archive needs a connected Gmail inbox.');
      return;
    }
    const list = this.threads();
    const idx = list.findIndex((t) => t.id === id);
    try {
      await this.api.archive(id);
      const next = list[idx + 1] ?? list[idx - 1] ?? null;
      this.threads.update((ts) => ts.filter((t) => t.id !== id));
      if (next) {
        await this.selectThread(next.id);
      } else {
        this.selectedId.set(null);
      }
      this.statusMessage.set('Archived');
    } catch (e) {
      this.statusMessage.set(e instanceof Error ? e.message : 'Archive failed');
    }
  }

  openReply(): void {
    this.replyOpen.set(true);
    this.composeOpen.set(false);
  }

  closeReply(): void {
    this.replyOpen.set(false);
  }

  openCompose(): void {
    this.composeOpen.set(true);
    this.commandPaletteOpen.set(false);
  }

  closeCompose(): void {
    this.composeOpen.set(false);
  }

  setReplyBody(value: string): void {
    this.replyBody.set(value);
  }

  removeComposeAttachment(id: string): void {
    this.composeAttachments.update((list) => list.filter((a) => a.id !== id));
  }

  addMockAttachment(): void {
    const n = this.composeAttachments().length + 1;
    this.composeAttachments.update((list) => [
      ...list,
      { id: `mock-${n}`, name: `attachment-${n}.zip`, sizeLabel: '1.1 MB' },
    ]);
  }

  async sendReply(): Promise<void> {
    const id = this.selectedId();
    const body = this.replyBody().trim();
    if (!body) {
      this.statusMessage.set('Write a reply first.');
      return;
    }
    if (!id || this.usingDemo()) {
      this.statusMessage.set('Demo mode — connect Gmail to send.');
      this.replyBody.set('');
      this.composeAttachments.set([]);
      this.replyOpen.set(false);
      this.composeOpen.set(false);
      return;
    }
    this.sending.set(true);
    try {
      await this.api.reply(id, body);
      this.replyBody.set('');
      this.composeAttachments.set([]);
      this.statusMessage.set('Sent');
      await this.loadThreadDetail(id);
    } catch (e) {
      this.statusMessage.set(e instanceof Error ? e.message : 'Send failed');
    } finally {
      this.sending.set(false);
    }
  }

  mockSend(): void {
    void this.sendReply();
  }

  toggleCommandPalette(): void {
    this.commandPaletteOpen.update((v) => !v);
  }

  closeCommandPalette(): void {
    this.commandPaletteOpen.set(false);
  }
}
