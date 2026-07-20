import { Service, computed, inject, signal } from '@angular/core';

import {
  MailApiService,
  type ApiThread,
  type ApiThreadDetail,
  type PublicAccount,
} from './mail-api.service';
import { openExternalUrl } from './open-external';
import {
  ACCENT_PRESETS,
  applyTheme,
  loadThemePrefs,
  saveThemePrefs,
  type ThemeDensity,
  type ThemeMode,
  type ThemePrefs,
} from './theme';

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
  bodyHtml: string;
  attachments: ShellAttachment[];
}

export interface ShellThreadPreview {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  time: string;
  unread: boolean;
  starred?: boolean;
  messages: ShellMessage[];
  hasAttachments?: boolean;
}

export type MailView = 'inbox' | 'starred' | 'all';

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
  readonly composeTo = signal('');
  readonly composeSubject = signal('');
  readonly composeBody = signal('');
  readonly searchQuery = signal('');
  readonly mailView = signal<MailView>('inbox');
  readonly theme = signal<ThemePrefs>(loadThemePrefs());
  readonly settingsOpen = signal(false);
  readonly aiBusy = signal(false);
  readonly summaryBusy = signal(false);
  readonly coreStatus = signal<CoreStatus>('checking');
  readonly accountEmail = signal<string | null>(null);
  readonly accounts = signal<PublicAccount[]>([]);
  readonly activeAccountId = signal<number | null>(null);
  readonly phaseLabel = signal('Local Mail');
  readonly accentPresets = ACCENT_PRESETS;
  private eventsAbort: AbortController | null = null;

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
    applyTheme(this.theme());
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
      this.accounts.set(health.accounts ?? []);
      if (health.account?.email) {
        this.accountEmail.set(health.account.email);
        this.activeAccountId.set(health.account.id ?? null);
        this.coreStatus.set('online-connected');
        await this.refreshThreads();
        this.connectLiveEvents();
        this.requestNotifyPermission();
      } else {
        this.coreStatus.set('online-disconnected');
        this.accountEmail.set(null);
        this.activeAccountId.set(null);
        this.statusMessage.set(
          'Core online — connect Gmail (opens your browser).',
        );
      }
    } catch {
      this.coreStatus.set('offline');
      this.statusMessage.set('Core offline. Run: cd apps/core && npm run dev');
    }
  }

  private connectLiveEvents(): void {
    this.eventsAbort?.abort();
    this.eventsAbort = new AbortController();
    const url = `${this.api.baseUrl}/events`;
    void (async () => {
      try {
        const res = await fetch(url, { signal: this.eventsAbort!.signal });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parts = buf.split('\n\n');
          buf = parts.pop() ?? '';
          for (const block of parts) {
            if (block.includes('mail.synced') || block.includes('mail.changed')) {
              void this.refreshThreads();
            }
          }
        }
      } catch {
        /* aborted or offline */
      }
    })();
  }

  private requestNotifyPermission(): void {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }

  private notify(title: string, body: string): void {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, { body });
      } catch {
        /* ignore */
      }
    }
  }

  private clearMailbox(): void {
    this.threads.set([]);
    this.selectedId.set(null);
    this.replyOpen.set(false);
    this.replyBody.set('');
  }

  setSearchQuery(q: string): void {
    this.searchQuery.set(q);
  }

  async runSearch(): Promise<void> {
    await this.refreshThreads();
  }

  async setMailView(view: MailView): Promise<void> {
    this.mailView.set(view);
    await this.refreshThreads();
  }

  openSettings(): void {
    this.settingsOpen.set(true);
    this.commandPaletteOpen.set(false);
  }

  closeSettings(): void {
    this.settingsOpen.set(false);
  }

  setThemeMode(mode: ThemeMode): void {
    const next = { ...this.theme(), mode };
    this.theme.set(next);
    saveThemePrefs(next);
    applyTheme(next);
  }

  setThemeAccent(accent: string): void {
    const next = { ...this.theme(), accent };
    this.theme.set(next);
    saveThemePrefs(next);
    applyTheme(next);
  }

  setThemeDensity(density: ThemeDensity): void {
    const next = { ...this.theme(), density };
    this.theme.set(next);
    saveThemePrefs(next);
    applyTheme(next);
  }

  /** Cycle dark ↔ light (palette shortcut). */
  toggleTheme(): void {
    const mode: ThemeMode = this.theme().mode === 'light' ? 'dark' : 'light';
    this.setThemeMode(mode);
  }

  async refreshThreads(): Promise<void> {
    this.listLoading.set(true);
    try {
      const res = await this.api.listThreads({
        q: this.searchQuery() || undefined,
        view: this.mailView(),
      });
      if (res.account?.email) {
        this.accountEmail.set(res.account.email);
      }
      if (!res.threads.length) {
        this.clearMailbox();
        this.statusMessage.set(
          this.searchQuery()
            ? 'No matches.'
            : 'Inbox empty locally — try Sync.',
        );
        return;
      }
      const mapped: ShellThreadPreview[] = res.threads.map((t: ApiThread) => ({
        id: t.id,
        from: t.from,
        subject: t.subject,
        snippet: t.snippet,
        time: t.time,
        unread: t.unread,
        starred: t.starred,
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
                  bodyHtml: m.bodyHtml ?? '',
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
          this.activeAccountId.set(status.accountId ?? null);
          this.accounts.set(status.accounts ?? []);
          this.coreStatus.set('online-connected');
          this.statusMessage.set(
            `Connected as ${status.email}. Syncing inbox…`,
          );
          this.connectLiveEvents();
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

  async syncNow(full = false): Promise<void> {
    this.syncing.set(true);
    this.statusMessage.set('Syncing…');
    try {
      const res = await this.api.sync(full);
      this.statusMessage.set(
        `Synced ${res.synced} (${res.mode ?? 'full'}) for ${res.email}`,
      );
      await this.refreshThreads();
      if (res.synced > 0) {
        this.notify('Local Mail', `Synced ${res.synced} thread(s)`);
      }
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
    // Optimistic remove
    const next = list[idx + 1] ?? list[idx - 1] ?? null;
    this.threads.update((ts) => ts.filter((t) => t.id !== id));
    if (next) void this.selectThread(next.id);
    else {
      this.selectedId.set(null);
      this.replyOpen.set(false);
    }
    try {
      await this.api.archive(id);
      this.statusMessage.set('Archived');
    } catch (e) {
      this.statusMessage.set(e instanceof Error ? e.message : 'Archive failed');
      await this.refreshThreads();
    }
  }

  async toggleStarSelected(): Promise<void> {
    const id = this.selectedId();
    const t = this.selectedThread();
    if (!id || !t || !this.isConnected()) return;
    const starred = !t.starred;
    this.threads.update((list) =>
      list.map((x) => (x.id === id ? { ...x, starred } : x)),
    );
    try {
      await this.api.star(id, starred);
    } catch (e) {
      this.statusMessage.set(e instanceof Error ? e.message : 'Star failed');
      await this.refreshThreads();
    }
  }

  openAttachment(attId: string): void {
    window.open(this.api.attachmentUrl(attId), '_blank', 'noopener,noreferrer');
  }

  async runDailySummary(): Promise<void> {
    this.summaryBusy.set(true);
    try {
      const res = await this.api.dailySummary();
      this.statusMessage.set(
        `Summary saved (${res.threadCount} threads): ${res.path}`,
      );
      this.notify('Mail summary saved', res.path);
    } catch (e) {
      this.statusMessage.set(e instanceof Error ? e.message : 'Summary failed');
    } finally {
      this.summaryBusy.set(false);
    }
  }

  async aiSummarizeSelected(): Promise<void> {
    const id = this.selectedId();
    if (!id) return;
    this.aiBusy.set(true);
    try {
      const res = await this.api.aiSummarize(id);
      this.statusMessage.set(`AI summary (${res.mode}) ready — see reply box`);
      this.replyBody.set(res.text);
      this.replyOpen.set(true);
    } catch (e) {
      this.statusMessage.set(e instanceof Error ? e.message : 'AI failed');
    } finally {
      this.aiBusy.set(false);
    }
  }

  async aiDraftSelected(): Promise<void> {
    const id = this.selectedId();
    if (!id) return;
    this.aiBusy.set(true);
    try {
      const res = await this.api.aiDraft(id);
      this.replyBody.set(res.text);
      this.replyOpen.set(true);
      this.statusMessage.set(`Draft ready (${res.mode})`);
    } catch (e) {
      this.statusMessage.set(e instanceof Error ? e.message : 'AI failed');
    } finally {
      this.aiBusy.set(false);
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

  setComposeTo(v: string): void {
    this.composeTo.set(v);
  }
  setComposeSubject(v: string): void {
    this.composeSubject.set(v);
  }
  setComposeBody(v: string): void {
    this.composeBody.set(v);
  }

  async sendCompose(): Promise<void> {
    if (!this.isConnected()) return;
    const to = this.composeTo().trim();
    const body = this.composeBody().trim();
    if (!to || !body) {
      this.statusMessage.set('To and body required');
      return;
    }
    this.sending.set(true);
    try {
      await this.api.sendNew(to, this.composeSubject(), body);
      this.composeOpen.set(false);
      this.composeTo.set('');
      this.composeSubject.set('');
      this.composeBody.set('');
      this.statusMessage.set('Message sent');
    } catch (e) {
      this.statusMessage.set(e instanceof Error ? e.message : 'Send failed');
    } finally {
      this.sending.set(false);
    }
  }

  /** OAuth add/connect another Google account (becomes active). */
  addAccount(): void {
    void this.connectGmail();
  }

  async switchAccount(accountId: number): Promise<void> {
    if (accountId === this.activeAccountId()) return;
    this.statusMessage.set('Switching account…');
    try {
      const res = await this.api.setActiveAccount(accountId);
      this.activeAccountId.set(res.account.id);
      this.accountEmail.set(res.account.email);
      this.clearMailbox();
      await this.refreshThreads();
      this.statusMessage.set(`Switched to ${res.account.email}`);
    } catch (e) {
      this.statusMessage.set(e instanceof Error ? e.message : 'Switch failed');
    }
  }

  async removeActiveAccount(): Promise<void> {
    const id = this.activeAccountId();
    if (id == null) return;
    if (!confirm(`Remove account ${this.accountEmail()} from Local Mail?`)) {
      return;
    }
    try {
      const res = await this.api.removeAccount(id);
      this.accounts.set(res.accounts);
      if (res.accounts.length) {
        await this.switchAccount(res.accounts[0]!.id);
      } else {
        this.coreStatus.set('online-disconnected');
        this.accountEmail.set(null);
        this.activeAccountId.set(null);
        this.clearMailbox();
        this.statusMessage.set('No accounts — connect Gmail.');
      }
    } catch (e) {
      this.statusMessage.set(e instanceof Error ? e.message : 'Remove failed');
    }
  }

  runPaletteCommand(cmd: string): void {
    this.closeCommandPalette();
    switch (cmd) {
      case 'archive':
        void this.archiveSelected();
        break;
      case 'reply':
        this.openReply();
        break;
      case 'compose':
        this.openCompose();
        break;
      case 'sync':
        void this.syncNow();
        break;
      case 'star':
        void this.toggleStarSelected();
        break;
      case 'summary':
        void this.runDailySummary();
        break;
      case 'ai-summary':
        void this.aiSummarizeSelected();
        break;
      case 'ai-draft':
        void this.aiDraftSelected();
        break;
      case 'theme':
        this.toggleTheme();
        break;
      case 'settings':
        this.openSettings();
        break;
      case 'inbox':
        void this.setMailView('inbox');
        break;
      case 'starred':
        void this.setMailView('starred');
        break;
      case 'add-account':
        this.addAccount();
        break;
      default:
        break;
    }
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
