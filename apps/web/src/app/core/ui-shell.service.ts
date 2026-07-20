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

export type CoreStatus =
  | 'checking'
  | 'offline'
  | 'online-disconnected'
  | 'online-connected'
  | 'misconfigured';

@Service()
export class UiShellService {
  private readonly api = inject(MailApiService);

  readonly threads = signal<ShellThreadPreview[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly detailLoading = signal(false);
  readonly listLoading = signal(false);
  readonly syncing = signal(false);
  readonly sending = signal(false);
  readonly statusMessage = signal<string | null>(null);
  readonly commandPaletteOpen = signal(false);
  readonly replyOpen = signal(false);
  readonly composeOpen = signal(false);
  readonly replyBody = signal('');
  readonly coreStatus = signal<CoreStatus>('checking');
  readonly accountEmail = signal<string | null>(null);
  readonly phaseLabel = signal('Phase 1 — Core + Gmail');

  readonly selectedThread = computed(() => {
    const id = this.selectedId();
    return this.threads().find((t) => t.id === id) ?? null;
  });

  readonly isConnected = computed(
    () => this.coreStatus() === 'online-connected',
  );

  readonly emptyInboxHint = computed(() => {
    switch (this.coreStatus()) {
      case 'checking':
        return 'Checking connection…';
      case 'offline':
        return 'Core is offline. Start: cd apps/core && npm run dev';
      case 'misconfigured':
        return 'Add GOOGLE_CLIENT_ID and SECRET to apps/core/.env';
      case 'online-disconnected':
        return 'Connect Gmail to load your inbox.';
      case 'online-connected':
        return this.listLoading()
          ? 'Loading…'
          : 'Inbox is empty. Try Sync inbox.';
      default:
        return '';
    }
  });

  async bootstrap(): Promise<void> {
    this.coreStatus.set('checking');
    this.clearMailbox();
    try {
      const health = await this.api.health();
      if (!health.googleConfigured) {
        this.coreStatus.set('misconfigured');
        this.statusMessage.set(
          'Core is up. Add GOOGLE_CLIENT_ID / SECRET in apps/core/.env — see docs/GMAIL_SETUP.md',
        );
        return;
      }
      if (health.account?.email) {
        this.accountEmail.set(health.account.email);
        this.coreStatus.set('online-connected');
        await this.refreshThreads();
      } else {
        this.coreStatus.set('online-disconnected');
        this.accountEmail.set(null);
        this.statusMessage.set(
          'Core online — connect Gmail (opens your browser).',
        );
      }
    } catch {
      this.coreStatus.set('offline');
      this.statusMessage.set('Core offline. Run: cd apps/core && npm run dev');
    }
  }

  private clearMailbox(): void {
    this.threads.set([]);
    this.selectedId.set(null);
    this.replyOpen.set(false);
    this.replyBody.set('');
  }

  async refreshThreads(): Promise<void> {
    this.listLoading.set(true);
    try {
      const res = await this.api.listThreads();
      if (res.account?.email) {
        this.accountEmail.set(res.account.email);
      }
      if (!res.threads.length) {
        this.clearMailbox();
        this.statusMessage.set('Inbox empty locally — try Sync.');
        return;
      }
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
   * Opens Google OAuth in the system browser.
   * Polls core until tokens are saved, then syncs — no browser redirect into the app.
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
      'Opening your browser for Google sign-in… Finish there, then return to this app.',
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
        // keep waiting
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
    if (!id || !this.isConnected()) {
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
        this.replyOpen.set(false);
      }
      this.statusMessage.set('Archived');
    } catch (e) {
      this.statusMessage.set(e instanceof Error ? e.message : 'Archive failed');
    }
  }

  openReply(): void {
    if (!this.isConnected() || !this.selectedId()) return;
    this.replyOpen.set(true);
    this.composeOpen.set(false);
  }

  closeReply(): void {
    this.replyOpen.set(false);
  }

  openCompose(): void {
    if (!this.isConnected()) {
      this.statusMessage.set('Connect Gmail first.');
      return;
    }
    this.composeOpen.set(true);
    this.commandPaletteOpen.set(false);
  }

  closeCompose(): void {
    this.composeOpen.set(false);
  }

  setReplyBody(value: string): void {
    this.replyBody.set(value);
  }

  async sendReply(): Promise<void> {
    const id = this.selectedId();
    const body = this.replyBody().trim();
    if (!body) {
      this.statusMessage.set('Write a reply first.');
      return;
    }
    if (!id || !this.isConnected()) {
      this.statusMessage.set('Connect Gmail to send.');
      return;
    }
    this.sending.set(true);
    try {
      await this.api.reply(id, body);
      this.replyBody.set('');
      this.statusMessage.set('Sent');
      await this.loadThreadDetail(id);
    } catch (e) {
      this.statusMessage.set(e instanceof Error ? e.message : 'Send failed');
    } finally {
      this.sending.set(false);
    }
  }

  toggleCommandPalette(): void {
    this.commandPaletteOpen.update((v) => !v);
  }

  closeCommandPalette(): void {
    this.commandPaletteOpen.set(false);
  }
}
