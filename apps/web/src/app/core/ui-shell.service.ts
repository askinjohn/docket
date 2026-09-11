import { Service, computed, inject, signal } from '@angular/core';

import { parseInsightText } from './ai-insight';
import { apiErrorInfo } from './api-error';
import {
  MailApiService,
  type AiConfigPublic,
  type AiStatus,
  type ApiLabel,
  type ApiMailView,
  type ApiThread,
  type ApiThreadDetail,
  type ApiThreadView,
  type PublicAccount,
  type Workflow,
  type WorkflowCatalog,
  type WorkflowJob,
  type WorkflowRun,
} from './mail-api.service';
import {
  getNotifyPermissionState,
  onNotifyOpenThread,
  requestNotifyPermission,
  setDockBadge,
  showNotification,
  type NotifyPermissionState,
} from './notify';
import { openExternalUrl } from './open-external';
import { readPref, writePref } from './pref-storage';
import {
  ACCENT_PRESETS,
  applyTheme,
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  UI_LAYOUT_OPTIONS,
  loadThemePrefs,
  saveThemePrefs,
  type FontFamily,
  type FontSize,
  type RemoteImagesMode,
  type ReplyDock,
  type ThemeDensity,
  type ThemeMode,
  type ThemePrefs,
  type UiLayout,
} from './theme';

export type {
  CoreStatus,
  MailView,
  PendingAttachment,
  ShellAttachment,
  ShellMessage,
  ShellThreadPreview,
} from './shell-models';
import type {
  CoreStatus,
  MailView,
  PendingAttachment,
  ShellThreadPreview,
} from './shell-models';

export type AttachmentViewMode = 'image' | 'pdf' | 'text' | 'other';

export interface AttachmentPreviewState {
  id: string;
  url: string;
  name: string;
  kind: string;
  mimeType: string;
  sizeLabel: string;
  view: AttachmentViewMode;
  kindLabel: string;
  icon: string;
  textContent: string;
  textLoading: boolean;
  textError: string | null;
}

const RECENT_OPENS_KEY = 'recent-opens';

function loadRecentOpens(): { id: string; subject: string; from: string }[] {
  try {
    const raw = readPref(RECENT_OPENS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (x): x is { id: string; subject: string; from: string } =>
          Boolean(x && typeof x.id === 'string'),
      )
      .slice(0, 8);
  } catch {
    return [];
  }
}

function resolveAttachmentView(
  kind: string,
  mime: string,
  name: string,
): AttachmentViewMode {
  if (kind === 'image' || mime.startsWith('image/')) return 'image';
  if (kind === 'pdf' || mime === 'application/pdf' || /\.pdf$/i.test(name)) {
    return 'pdf';
  }
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    mime === 'application/javascript' ||
    /\.(txt|md|csv|json|xml|log|html?|css|js|ts|svg)$/i.test(name)
  ) {
    return 'text';
  }
  return 'other';
}

function kindLabel(kind: string, mime: string): string {
  if (kind === 'image' || mime.startsWith('image/')) return 'Image';
  if (kind === 'pdf' || mime === 'application/pdf') return 'PDF';
  if (kind === 'doc') return 'Document';
  if (mime) return mime;
  return 'File';
}

function iconForKind(kind: string): string {
  switch (kind) {
    case 'pdf':
      return '📕';
    case 'image':
      return '🖼️';
    case 'doc':
      return '📘';
    default:
      return '📎';
  }
}

@Service()
export class UiShellService {
  /** Exposed for attachment thumbnail URLs in templates. */
  readonly api = inject(MailApiService);

  readonly threads = signal<ShellThreadPreview[]>([]);
  /** Thread open in the reading pane (single focus). */
  readonly selectedId = signal<string | null>(null);
  /** Keyboard highlight in the list (can exist without opening the thread). */
  readonly listCursorId = signal<string | null>(null);
  /**
   * Multi-select set for bulk actions (⌘/Ctrl-click, Shift-range, click-drag).
   * Independent of selectedId until a bulk action runs.
   */
  readonly checkedIds = signal<ReadonlySet<string>>(new Set());
  readonly detailLoading = signal(false);
  readonly listLoading = signal(false);
  readonly syncing = signal(false);
  readonly sending = signal(false);
  readonly statusMessage = signal<string | null>(null);

  /** Dismiss the thread-list status toast (e.g. remote-images notice). */
  clearStatusMessage(): void {
    this.statusMessage.set(null);
  }
  readonly commandPaletteOpen = signal(false);
  readonly replyOpen = signal(false);
  readonly replyAll = signal(false);
  readonly replyToMessageId = signal<string | null>(null);
  readonly composeOpen = signal(false);
  readonly replyBody = signal('');
  readonly composeTo = signal('');
  readonly composeCc = signal('');
  readonly composeSubject = signal('');
  readonly composeBody = signal('');
  /** Show Cc field in the compose window. */
  readonly composeShowCc = signal(false);
  readonly composeAttachments = signal<PendingAttachment[]>([]);
  readonly replyAttachments = signal<PendingAttachment[]>([]);
  /** Gmail has another page of inbox after last full/more sync. */
  readonly hasMoreMail = signal(false);
  readonly loadingMore = signal(false);
  /** Quiet top-up to keep ~LIST_TARGET rows in the viewport list. */
  readonly listFilling = signal(false);
  /** True while a Gmail search query is active (list is search results). */
  readonly searchActive = signal(false);
  readonly searching = signal(false);

  /** Keep about this many threads in the list when Gmail still has more. */
  private readonly listTarget = 100;
  private listFillInFlight = false;
  /** Typeahead from mail history (To or Cc field). */
  readonly contactSuggestions = signal<
    { email: string; name: string; hits: number }[]
  >([]);
  readonly contactSuggestField = signal<'to' | 'cc' | null>(null);
  readonly contactSuggestHighlight = signal(0);
  private contactSuggestTimer: ReturnType<typeof setTimeout> | null = null;
  private contactSuggestSeq = 0;
  readonly searchQuery = signal('');
  readonly mailView = signal<MailView>('inbox');
  /** Active Gmail label id when mailView === 'label'. */
  readonly activeLabelId = signal<string | null>(null);
  /** Active custom view when mailView === 'custom'. */
  readonly activeCustomViewId = signal<number | null>(null);
  readonly labels = signal<ApiLabel[]>([]);
  readonly customViews = signal<ApiMailView[]>([]);
  readonly theme = signal<ThemePrefs>(loadThemePrefs());
  readonly settingsOpen = signal(false);
  readonly workflowsOpen = signal(false);
  readonly workflows = signal<Workflow[]>([]);
  readonly workflowRuns = signal<WorkflowRun[]>([]);
  readonly workflowCatalog = signal<WorkflowCatalog | null>(null);
  readonly workflowPath = signal<string | null>(null);
  readonly workflowBusy = signal(false);
  readonly workflowDraft = signal<Workflow | null>(null);
  readonly workflowJobs = signal<WorkflowJob[]>([]);
  readonly workflowActivityOpen = signal(false);
  readonly workflowReportOpen = signal(false);
  readonly workflowReport = signal<{
    title: string;
    body: string;
    jobId: string;
  } | null>(null);
  readonly shellSection = signal<'mail' | 'workflows'>('mail');
  /** Keyboard shortcuts cheatsheet (`?`). */
  readonly helpOpen = signal(false);
  /**
   * Incremented when `/` focuses the search box — ThreadList reacts via effect.
   */
  readonly searchFocusNonce = signal(0);
  readonly accountMenuOpen = signal(false);
  readonly lastNotify = signal<{
    title: string;
    body: string;
    threadId?: string;
    at: number;
  } | null>(null);
  readonly aiBusy = signal(false);
  /** Core AI backend: template | ollama | openai */
  readonly aiMode = signal<string | null>(null);
  readonly aiStatus = signal<AiStatus | null>(null);
  readonly aiConfig = signal<AiConfigPublic | null>(null);
  readonly aiConfigSaving = signal(false);
  readonly summaryBusy = signal(false);
  /** AI summary / insight panel (not the reply composer). */
  readonly aiInsightOpen = signal(false);
  readonly aiInsightText = signal('');
  readonly aiInsightMode = signal<string | null>(null);
  readonly aiInsightError = signal<string | null>(null);
  readonly aiChatMessages = signal<
    { role: 'user' | 'assistant'; content: string }[]
  >([]);
  readonly aiChatDraft = signal('');
  readonly aiChatBusy = signal(false);
  /** Mailbox-wide Ask AI (Mail layout rail). */
  readonly mailboxAskDraft = signal('');
  readonly mailboxAskBusy = signal(false);
  readonly mailboxAskError = signal<string | null>(null);
  readonly mailboxAskMessages = signal<
    { role: 'user' | 'assistant'; content: string }[]
  >([]);
  readonly mailboxAskOpen = signal(false);
  readonly recentOpens = signal<
    { id: string; subject: string; from: string }[]
  >(loadRecentOpens());
  readonly coreStatus = signal<CoreStatus>('checking');
  readonly accountEmail = signal<string | null>(null);
  readonly accounts = signal<PublicAccount[]>([]);
  readonly activeAccountId = signal<number | null>(null);

  /**
   * Keep accounts list + active id + display email in lockstep.
   * Prevents “✓ on gmail while footer shows work@…” desync.
   */
  private applyAccountSession(opts: {
    accounts?: PublicAccount[] | null;
    activeId?: number | null;
    account?: { id?: number | null; email?: string | null } | null;
  }): void {
    if (opts.accounts) {
      this.accounts.set(
        opts.accounts.map((a) => ({
          ...a,
          id: Number(a.id),
        })),
      );
    }

    const list = this.accounts();
    let id =
      opts.activeId != null
        ? Number(opts.activeId)
        : opts.account?.id != null
          ? Number(opts.account.id)
          : this.activeAccountId();
    let email =
      opts.account?.email?.trim() ||
      this.accountEmail();

    // Prefer explicit activeId → email from list
    if (id != null && Number.isFinite(id)) {
      const row = list.find((a) => Number(a.id) === id);
      if (row) email = row.email;
    } else if (email) {
      const row = list.find(
        (a) => a.email.toLowerCase() === email!.toLowerCase(),
      );
      if (row) id = Number(row.id);
    }

    if (email) this.accountEmail.set(email);
    if (id != null && Number.isFinite(id)) this.activeAccountId.set(id);
  }

  /** True if this sidebar row is the open/active mailbox. */
  isActiveAccount(acc: { id: number; email: string }): boolean {
    const id = this.activeAccountId();
    if (id != null && Number(id) === Number(acc.id)) return true;
    return false;
  }

  /** Re-fetch accounts + active id (e.g. when opening the account menu). */
  async refreshAccounts(): Promise<void> {
    try {
      const res = await this.api.listAccounts();
      this.applyAccountSession({
        accounts: res.accounts,
        activeId: res.activeId,
      });
    } catch {
      /* ignore — offline / race */
    }
  }
  readonly phaseLabel = signal('Docket');
  readonly accentPresets = ACCENT_PRESETS;
  /** True while at least one archive can still be undone. */
  readonly undoAvailable = signal(false);
  readonly undoCount = signal(0);
  private eventsAbort: AbortController | null = null;
  private bgSyncTimer: ReturnType<typeof setInterval> | null = null;
  /** Multi-step undo stack (most recent last). Each entry times out after 12s. */
  private archiveUndoStack: {
    thread: ShellThreadPreview;
    index: number;
    timer: ReturnType<typeof setTimeout>;
  }[] = [];
  /** Batch mail.new within a short window so bursts don't spam banners. */
  private pendingNewMail: {
    threadId: string;
    from: string;
    subject: string;
  }[] = [];
  private newMailFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private visibilityHooked = false;

  readonly selectedThread = computed(() => {
    const id = this.selectedId();
    return this.threads().find((t) => t.id === id) ?? null;
  });

  /** Open thread, or list cursor, or first row — what ↑↓ / e act on. */
  readonly focusedThreadId = computed(
    () =>
      this.selectedId() ??
      this.listCursorId() ??
      this.threads()[0]?.id ??
      null,
  );

  readonly isSplitLayout = computed(() => this.theme().uiLayout === 'split');

  /** List-first: list fills the main column until a thread is opened. */
  readonly showThreadList = computed(
    () =>
      this.shellSection() === 'mail' &&
      (this.isSplitLayout() || !this.selectedId()),
  );

  readonly showReadingPane = computed(
    () =>
      this.shellSection() === 'mail' &&
      (this.isSplitLayout() || Boolean(this.selectedId())),
  );

  readonly showWorkflowsPage = computed(
    () => this.shellSection() === 'workflows',
  );

  readonly checkedCount = computed(() => this.checkedIds().size);

  readonly isConnected = computed(
    () => this.coreStatus() === 'online-connected',
  );

  private lastCheckedAnchor: string | null = null;
  /**
   * Thread ids optimistically archived but not yet confirmed by the API.
   * Filtered out of list refreshes so SSE / ensureListFilled cannot resurrect them.
   */
  private readonly pendingArchiveIds = new Set<string>();
  /** Avoid overlapping OAuth wait loops. */
  private authRedirectInFlight = false;

  readonly emptyInboxHint = computed(() => {
    switch (this.coreStatus()) {
      case 'checking':
        return 'Checking connection…';
      case 'offline':
        return 'Core is offline. Start: cd apps/core && npm run dev';
      case 'misconfigured':
        return 'Add GOOGLE_CLIENT_ID and SECRET to apps/core/.env';
      case 'auth-expired':
        return 'Gmail session expired. Sign in again to load new mail.';
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

  /**
   * When Google rejects the refresh token, flip UI to re-login and open OAuth.
   * Safe to call from any Gmail API failure path.
   */
  handleAuthExpired(source = 'api'): void {
    this.coreStatus.set('auth-expired');
    this.stopBackgroundSync();
    this.clearMailbox();
    this.statusMessage.set(
      'Gmail session expired. Sign in again to continue.',
    );
    void source;
  }

  /** Shared catch for shell Gmail actions — redirects on expired tokens. */
  private handleGmailFailure(e: unknown, fallback: string): void {
    const info = apiErrorInfo(e);
    if (info.authExpired) {
      this.handleAuthExpired(fallback);
      return;
    }
    this.statusMessage.set(info.message || fallback);
  }

  async bootstrap(): Promise<void> {
    applyTheme(this.theme());
    this.coreStatus.set('checking');
    this.clearMailbox();
    try {
      const health = await this.api.health();
      if (health.aiMode) this.aiMode.set(health.aiMode);
      if (health.ai) this.aiStatus.set(health.ai);
      void this.refreshAiStatus();
      if (!health.googleConfigured) {
        this.coreStatus.set('misconfigured');
        this.statusMessage.set(
          'Core is up. Add GOOGLE_CLIENT_ID / SECRET in apps/core/.env — see docs/GMAIL_SETUP.md',
        );
        return;
      }
      this.applyAccountSession({
        accounts: health.accounts ?? [],
        account: health.account,
        activeId: health.account?.id ?? null,
      });
      const expired =
        health.authExpired === true ||
        health.account?.authStatus === 'expired';
      if (expired && health.account?.email) {
        this.accountEmail.set(health.account.email);
        this.activeAccountId.set(health.account.id ?? null);
        this.handleAuthExpired('bootstrap');
      } else if (health.account?.email && health.connected !== false) {
        this.coreStatus.set('checking');
        try {
          await this.api.sync(false);
        } catch (e) {
          if (apiErrorInfo(e).authExpired) {
            this.handleAuthExpired('bootstrap-probe');
            return;
          }
        }
        this.coreStatus.set('online-connected');
        await this.refreshThreads();
        void this.refreshNavMeta();
        this.connectLiveEvents();
        this.startBackgroundSync();
        this.hookVisibilityForNotify();
        this.requestNotifyPermission();
      } else {
        this.coreStatus.set('online-disconnected');
        this.accountEmail.set(null);
        this.activeAccountId.set(null);
        this.stopBackgroundSync();
        this.statusMessage.set(
          'Core online — connect Gmail (opens your browser).',
        );
      }
    } catch {
      this.coreStatus.set('offline');
      this.stopBackgroundSync();
      this.statusMessage.set('Core offline. Run: cd apps/core && npm run dev');
    }
  }

  /** Quiet history sync so new mail lands without a manual Sync. */
  private startBackgroundSync(): void {
    this.stopBackgroundSync();
    // 30s is a better dogfood default than 60s for Notification Center
    this.bgSyncTimer = setInterval(() => {
      if (!this.isConnected() || this.syncing() || this.sending()) return;
      void this.quietSync();
    }, 30_000);
  }

  private stopBackgroundSync(): void {
    if (this.bgSyncTimer) {
      clearInterval(this.bgSyncTimer);
      this.bgSyncTimer = null;
    }
  }

  private async quietSync(): Promise<void> {
    try {
      const res = await this.api.sync(false);
      if (res.hasMore != null) this.hasMoreMail.set(Boolean(res.hasMore));
      // Notify from sync response (works even if SSE is disconnected)
      this.ingestNewMailNotices(res.newMail);
      if (res.synced > 0 || (res.newMail && res.newMail.length > 0)) {
        await this.refreshThreads();
      }
    } catch (e) {
      const info = apiErrorInfo(e);
      if (info.authExpired) {
        this.handleAuthExpired('quiet-sync');
      }
      /* other background failures stay quiet */
    }
  }

  /** Deduped path used by SSE and by sync HTTP response. */
  private ingestNewMailNotices(
    items:
      | {
          threadId: string;
          from: string;
          subject: string;
        }[]
      | undefined
      | null,
  ): void {
    if (!items?.length) return;
    for (const m of items) {
      this.queueNewMailNotification({
        threadId: m.threadId,
        from: m.from,
        subject: m.subject,
      });
    }
  }

  private syncUndoSignals(): void {
    this.undoCount.set(this.archiveUndoStack.length);
    this.undoAvailable.set(this.archiveUndoStack.length > 0);
  }

  private clearArchiveUndo(): void {
    for (const entry of this.archiveUndoStack) {
      clearTimeout(entry.timer);
    }
    this.archiveUndoStack = [];
    this.syncUndoSignals();
  }

  private pushArchiveUndo(thread: ShellThreadPreview, index: number): void {
    const entry = {
      thread,
      index,
      timer: setTimeout(() => {
        this.archiveUndoStack = this.archiveUndoStack.filter((e) => e !== entry);
        this.syncUndoSignals();
        if (!this.archiveUndoStack.length && this.statusMessage()?.includes('undo')) {
          this.statusMessage.set(null);
        }
      }, 12_000),
    };
    this.archiveUndoStack.push(entry);
    // Cap stack so a bulk archive session can't grow unbounded
    while (this.archiveUndoStack.length > 30) {
      const old = this.archiveUndoStack.shift();
      if (old) clearTimeout(old.timer);
    }
    this.syncUndoSignals();
  }

  private connectLiveEvents(): void {
    this.eventsAbort?.abort();
    this.eventsAbort = new AbortController();
    onNotifyOpenThread((threadId) => {
      void this.selectThread(threadId);
    });
    void this.runEventStreamLoop(this.eventsAbort.signal);
  }

  /** Keep SSE alive; reconnect after drops so mail.new is not lost. */
  private async runEventStreamLoop(signal: AbortSignal): Promise<void> {
    const url = `${this.api.baseUrl}/events`;
    let delayMs = 1000;
    while (!signal.aborted) {
      try {
        const res = await fetch(url, { signal });
        if (!res.ok || !res.body) {
          throw new Error(`events HTTP ${res.status}`);
        }
        delayMs = 1000;
        console.info('[events] SSE connected');
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
            this.handleSseBlock(block);
          }
        }
        console.warn('[events] SSE ended — reconnecting');
      } catch (e) {
        if (signal.aborted) return;
        console.warn('[events] SSE error — reconnecting', e);
      }
      await new Promise((r) => setTimeout(r, delayMs));
      delayMs = Math.min(delayMs * 1.5, 15_000);
    }
  }

  private handleSseBlock(block: string): void {
    let eventName = '';
    let dataLine = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      if (line.startsWith('data:')) dataLine += line.slice(5).trim();
    }
    if (!dataLine) return;

    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(dataLine) as Record<string, unknown>;
    } catch {
      return;
    }

    const type = (eventName || (payload['type'] as string) || '') as string;

    if (type === 'mail.new') {
      console.info('[events] mail.new', payload['from'], payload['subject']);
      this.ingestNewMailNotices([
        {
          threadId: String(payload['threadId'] ?? ''),
          from: String(payload['from'] ?? 'New mail'),
          subject: String(payload['subject'] ?? '(no subject)'),
        },
      ]);
      void this.refreshThreads();
      return;
    }

    if (type === 'auth.expired') {
      if (payload['email']) {
        this.accountEmail.set(String(payload['email']));
      }
      this.handleAuthExpired('sse');
      return;
    }

    if (type === 'workflow.job') {
      const job = payload['job'] as WorkflowJob | undefined;
      if (job?.id) this.upsertWorkflowJob(job);
      return;
    }

    if (type === 'mail.synced' || type === 'mail.changed') {
      void this.refreshThreads();
    }
  }

  private queueNewMailNotification(item: {
    threadId: string;
    from: string;
    subject: string;
  }): void {
    if (!item.threadId) return;
    // Still notify if you're reading another thread; only skip exact same thread
    if (this.selectedId() === item.threadId) {
      console.info('[notify] skip — already viewing thread', item.threadId);
      return;
    }
    // Dedup same thread if SSE + HTTP both deliver
    if (this.pendingNewMail.some((p) => p.threadId === item.threadId)) return;

    this.pendingNewMail.push(item);
    if (this.newMailFlushTimer) clearTimeout(this.newMailFlushTimer);
    this.newMailFlushTimer = setTimeout(() => {
      this.newMailFlushTimer = null;
      void this.flushNewMailNotifications();
    }, 400);
  }

  private appIsForeground(): boolean {
    return (
      typeof document === 'undefined' ||
      document.visibilityState === 'visible'
    );
  }

  /** In-app toasts only while the window is in front. */
  private hookVisibilityForNotify(): void {
    if (this.visibilityHooked || typeof document === 'undefined') return;
    this.visibilityHooked = true;
    document.addEventListener('visibilitychange', () => {
      if (this.appIsForeground() && this.pendingNewMail.length) {
        void this.flushNewMailNotifications();
      }
    });
  }

  private async flushNewMailNotifications(): Promise<void> {
    if (!this.appIsForeground()) return;
    const raw = this.pendingNewMail.splice(0, this.pendingNewMail.length);
    if (!raw.length) return;
    // One notice per thread
    const seen = new Set<string>();
    const batch = raw.filter((m) => {
      if (seen.has(m.threadId)) return false;
      seen.add(m.threadId);
      return true;
    });

    if (batch.length === 1) {
      const m = batch[0]!;
      console.info('[notify] show', m.from, m.subject);
      this.pushNotifyToast({
        title: m.from,
        body: m.subject,
        threadId: m.threadId,
      });
      this.statusMessage.set(`New mail: ${m.from} — ${m.subject}`);
      return;
    }

    // Multiple arrivals: one summary + open first
    const first = batch[0]!;
    console.info('[notify] show batch', batch.length);
    this.pushNotifyToast({
      title: `${batch.length} new messages`,
      body: batch
        .slice(0, 3)
        .map((m) => `${m.from}: ${m.subject}`)
        .join(' · '),
      threadId: first.threadId,
    });
    this.statusMessage.set(`${batch.length} new messages`);
  }

  /** Dev / Settings: verify Notification Center without waiting for mail. */
  async testNotification(): Promise<void> {
    await requestNotifyPermission();
    await this.refreshNotifyStatus();
    const result = await showNotification({
      title: 'Docket',
      body: 'Test notification — if you see this, notifications work.',
      threadId: this.selectedId() ?? undefined,
    });
    this.pushNotifyToast({
      title: 'Docket',
      body: 'Test notification — if you see this, notifications work.',
      threadId: this.selectedId() ?? undefined,
    });
    await this.refreshNotifyStatus();
    this.statusMessage.set(
      result.ok
        ? `Notification sent (${result.channel}). ${result.detail}`
        : `Notification failed. ${result.detail}`,
    );
    console.info('[notify] test result', result);
  }

  private requestNotifyPermission(): void {
    void (async () => {
      await requestNotifyPermission();
      // Dev builds often don't appear under Settings until the first real send.
      // Surface a one-shot hint so users know what to look for.
      try {
        const isTauri = Boolean(
          (window as unknown as { __TAURI_INTERNALS__?: unknown })
            .__TAURI_INTERNALS__,
        );
        if (!isTauri) {
          console.info(
            '[notify] Browser mode — Notifications appear under Chrome/Safari, not “Docket”. Use npm run desktop:dev for a Dock app entry.',
          );
          return;
        }
        console.info(
          '[notify] Dock mode — after Test notification, check System Settings → Notifications for “Docket” or “docket”.',
        );
      } catch {
        /* ignore */
      }
    })();
  }

  pushNotifyToast(item: {
    title: string;
    body: string;
    threadId?: string;
  }): void {
    this.lastNotify.set({ ...item, at: Date.now() });
  }

  dismissNotifyToast(): void {
    this.lastNotify.set(null);
  }

  openNotifyToast(): void {
    const n = this.lastNotify();
    this.lastNotify.set(null);
    if (n?.threadId) void this.selectThread(n.threadId);
  }

  private notify(title: string, body: string, threadId?: string): void {
    void showNotification({ title, body, threadId });
    this.pushNotifyToast({ title, body, threadId });
  }

  private clearMailbox(): void {
    this.threads.set([]);
    this.selectedId.set(null);
    this.listCursorId.set(null);
    this.clearChecked();
    this.replyOpen.set(false);
    this.replyBody.set('');
  }

  setSearchQuery(q: string): void {
    this.searchQuery.set(q);
    if (!q.trim()) {
      this.searchActive.set(false);
    }
  }

  /** Clear search and return to normal inbox listing. */
  async clearSearch(): Promise<void> {
    this.searchQuery.set('');
    this.searchActive.set(false);
    await this.refreshThreads();
  }

  /**
   * Search: hit Gmail with the query (operators OK), cache hits, show locally.
   * Empty query → local list only.
   */
  async runSearch(): Promise<void> {
    const q = this.searchQuery().trim();
    if (!q) {
      this.searchActive.set(false);
      await this.refreshThreads();
      return;
    }
    if (!this.isConnected()) {
      // Offline: filter whatever is already cached
      this.searchActive.set(true);
      await this.refreshThreads();
      return;
    }

    this.searching.set(true);
    this.statusMessage.set(`Searching Gmail for “${q}”…`);
    try {
      const res = await this.api.searchGmail(q, { maxResults: 40 });
      this.searchActive.set(true);
      this.hasMoreMail.set(Boolean(res.hasMore));
      this.statusMessage.set(
        res.synced > 0
          ? `Found ${res.synced} thread(s) for “${res.query}”`
          : `No Gmail matches for “${res.query}”`,
      );
      await this.refreshThreads();
    } catch (e) {
      const info = apiErrorInfo(e);
      if (info.authExpired) {
        this.handleAuthExpired('search');
        return;
      }
      this.statusMessage.set(info.message || 'Search failed');
      // Fall back to local filter
      this.searchActive.set(true);
      await this.refreshThreads();
    } finally {
      this.searching.set(false);
    }
  }

  async setMailView(view: MailView): Promise<void> {
    this.shellSection.set('mail');
    this.mailView.set(view);
    if (view !== 'label') this.activeLabelId.set(null);
    if (view !== 'custom') this.activeCustomViewId.set(null);
    // Leaving search when switching primary views keeps UX clear
    if (view !== 'custom' && this.searchActive()) {
      this.searchQuery.set('');
      this.searchActive.set(false);
    }
    if (!this.isSplitLayout()) this.backToList();
    await this.refreshThreads();
  }

  async openLabel(labelId: string): Promise<void> {
    this.shellSection.set('mail');
    this.activeLabelId.set(labelId);
    this.activeCustomViewId.set(null);
    this.mailView.set('label');
    if (this.searchActive()) {
      this.searchQuery.set('');
      this.searchActive.set(false);
    }
    if (!this.isSplitLayout()) this.backToList();
    await this.refreshThreads();
  }

  async openCustomView(view: ApiMailView): Promise<void> {
    this.shellSection.set('mail');
    this.activeCustomViewId.set(view.id);
    this.activeLabelId.set(null);
    this.mailView.set('custom');
    this.searchQuery.set(view.query);
    if (!this.isSplitLayout()) this.backToList();
    await this.runSearch();
  }

  async refreshNavMeta(): Promise<void> {
    if (!this.isConnected()) {
      this.labels.set([]);
      this.customViews.set([]);
      return;
    }
    try {
      const [labelsRes, viewsRes] = await Promise.all([
        this.api.listLabels(),
        this.api.listViews(),
      ]);
      this.labels.set(labelsRes.labels ?? []);
      this.customViews.set(viewsRes.views ?? []);
    } catch {
      /* offline / core old */
    }
  }

  async addCustomViewFromSearch(): Promise<void> {
    const q = this.searchQuery().trim();
    if (!q) {
      this.statusMessage.set('Run a search first, then save as view.');
      return;
    }
    const name = window.prompt('Name for this view', q.slice(0, 40));
    if (!name?.trim()) return;
    try {
      const res = await this.api.createView(name.trim(), q);
      await this.refreshNavMeta();
      this.statusMessage.set(`Saved view “${res.view.name}”`);
      await this.openCustomView(res.view);
    } catch (e) {
      this.statusMessage.set(e instanceof Error ? e.message : 'Save view failed');
    }
  }

  async removeCustomView(id: number): Promise<void> {
    try {
      await this.api.deleteView(id);
      if (this.activeCustomViewId() === id) {
        await this.setMailView('inbox');
      }
      await this.refreshNavMeta();
    } catch (e) {
      this.statusMessage.set(e instanceof Error ? e.message : 'Delete view failed');
    }
  }

  /** @deprecated Prefer setRemoteImagesMode */
  setBlockRemoteImages(block: boolean): void {
    this.setRemoteImagesMode(block ? 'ask' : 'always');
  }

  setRemoteImagesMode(mode: RemoteImagesMode): void {
    const next: ThemePrefs = {
      ...this.theme(),
      remoteImagesMode: mode,
      blockRemoteImages: mode !== 'always',
    };
    this.theme.set(next);
    saveThemePrefs(next);
    if (mode === 'always' || mode === 'never') {
      this.remoteImagesUnlockedThreadId.set(null);
    }
  }

  /**
   * Per-thread unlock when mode is “ask”. Cleared when switching threads.
   */
  readonly remoteImagesUnlockedThreadId = signal<string | null>(null);

  /** True when remote images should be blocked for the current thread. */
  readonly blockRemoteImagesNow = computed(() => {
    const mode = this.theme().remoteImagesMode ?? 'ask';
    if (mode === 'always') return false;
    if (mode === 'never') return true;
    // ask: blocked unless this thread was unlocked
    const id = this.selectedId();
    return !id || this.remoteImagesUnlockedThreadId() !== id;
  });

  /** Banner only in “ask” mode (not when always-block). */
  readonly canUnlockRemoteImagesForThread = computed(
    () => (this.theme().remoteImagesMode ?? 'ask') === 'ask',
  );

  showRemoteImagesForThread(): void {
    if ((this.theme().remoteImagesMode ?? 'ask') !== 'ask') return;
    const id = this.selectedId();
    if (!id) return;
    this.remoteImagesUnlockedThreadId.set(id);
    this.statusMessage.set('Remote images loaded for this thread only');
  }

  hideRemoteImagesForThread(): void {
    this.remoteImagesUnlockedThreadId.set(null);
  }

  setReplyDock(dock: ReplyDock): void {
    const next = { ...this.theme(), replyDock: dock };
    this.theme.set(next);
    saveThemePrefs(next);
  }

  toggleReplyDock(): void {
    this.setReplyDock(this.theme().replyDock === 'right' ? 'bottom' : 'right');
  }

  closeAiInsight(): void {
    this.aiInsightOpen.set(false);
    this.aiInsightError.set(null);
    this.aiChatBusy.set(false);
  }

  setAiChatDraft(value: string): void {
    this.aiChatDraft.set(value);
  }

  private resetAiChat(): void {
    this.aiChatMessages.set([]);
    this.aiChatDraft.set('');
    this.aiInsightText.set('');
    this.aiInsightError.set(null);
  }

  lastAssistantReply(): string {
    const msgs = this.aiChatMessages();
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i]!.role === 'assistant' && msgs[i]!.content.trim()) {
        return msgs[i]!.content.trim();
      }
    }
    return parseInsightText(this.aiInsightText()).plainText.trim();
  }

  /** Copy last AI turn into the reply composer (user can edit before send). */
  insertInsightIntoReply(): void {
    const text = this.lastAssistantReply();
    if (!text) return;
    const existing = this.replyBody().trim();
    this.replyBody.set(existing ? `${existing}\n\n${text}` : text);
    this.replyOpen.set(true);
    this.composeOpen.set(false);
    this.statusMessage.set('Inserted into reply — edit before send');
  }

  async copyAiInsight(): Promise<void> {
    const text = this.lastAssistantReply();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.statusMessage.set('Summary copied');
    } catch {
      this.statusMessage.set('Could not copy to clipboard');
    }
  }

  openSettings(): void {
    this.settingsOpen.set(true);
    this.accountMenuOpen.set(false);
    this.commandPaletteOpen.set(false);
    void this.refreshNotifyStatus();
    void this.refreshAiStatus();
  }

  async refreshAiStatus(): Promise<void> {
    try {
      const s = await this.api.aiStatus();
      this.aiStatus.set(s);
      this.aiMode.set(s.mode);
      if (s.config) this.aiConfig.set(s.config);
    } catch {
      /* core offline */
    }
  }

  async saveAiConfig(next: {
    backends: NonNullable<AiConfigPublic['backends']>;
    roles: NonNullable<AiConfigPublic['roles']>;
  }): Promise<void> {
    this.aiConfigSaving.set(true);
    try {
      const saved = await this.api.saveAiConfig(next);
      this.aiConfig.set(saved);
      this.statusMessage.set(`Saved AI config · ${saved.path}`);
      await this.refreshAiStatus();
    } catch (e) {
      this.statusMessage.set(e instanceof Error ? e.message : 'Save AI config failed');
    } finally {
      this.aiConfigSaving.set(false);
    }
  }

  setAiRole(roleId: string, patch: { backend?: string; model?: string }): void {
    const cfg = this.aiConfig();
    if (!cfg) return;
    const prev = cfg.roles[roleId] ?? { backend: 'local', model: '' };
    const roles = {
      ...cfg.roles,
      [roleId]: {
        backend: patch.backend ?? prev.backend,
        model: patch.model ?? prev.model,
      },
    };
    void this.saveAiConfig({ backends: cfg.backends, roles });
  }

  closeSettings(): void {
    this.settingsOpen.set(false);
  }

  openWorkflows(): void {
    this.shellSection.set('workflows');
    this.workflowsOpen.set(false);
    this.closeSettings();
    void this.refreshWorkflows();
  }

  closeWorkflows(): void {
    this.workflowsOpen.set(false);
    this.workflowDraft.set(null);
    if (this.shellSection() === 'workflows') this.shellSection.set('mail');
  }

  async refreshWorkflows(): Promise<void> {
    try {
      const res = await this.api.listWorkflows();
      this.workflows.set(res.workflows);
      this.workflowRuns.set(res.runs);
      this.workflowJobs.set(res.jobs ?? []);
      this.workflowCatalog.set(res.catalog);
      this.workflowPath.set(res.path);
    } catch (e) {
      this.statusMessage.set(apiErrorInfo(e).message);
    }
  }

  async suggestWorkflow(
    english: string,
    backend: string,
    model: string,
  ): Promise<void> {
    this.workflowBusy.set(true);
    try {
      const res = await this.api.suggestWorkflow(english, backend, model);
      this.workflowDraft.set(res.workflow);
    } catch (e) {
      this.statusMessage.set(apiErrorInfo(e).message);
    } finally {
      this.workflowBusy.set(false);
    }
  }

  applyWorkflowDraft(wf: Workflow): void {
    this.workflowDraft.set(wf);
  }

  async saveWorkflowEdits(wf: Workflow): Promise<void> {
    this.workflowBusy.set(true);
    try {
      await this.api.saveWorkflow(wf);
      await this.refreshWorkflows();
      this.statusMessage.set(`Saved “${wf.name}”`);
    } catch (e) {
      this.statusMessage.set(apiErrorInfo(e).message);
    } finally {
      this.workflowBusy.set(false);
    }
  }

  async approveWorkflow(wf: Workflow): Promise<void> {
    this.workflowBusy.set(true);
    try {
      const saved = await this.api.saveWorkflow({
        ...wf,
        approved: true,
        enabled: true,
      });
      this.workflowDraft.set(null);
      await this.refreshWorkflows();
      this.statusMessage.set(`Workflow “${saved.workflow.name}” on`);
    } catch (e) {
      this.statusMessage.set(apiErrorInfo(e).message);
    } finally {
      this.workflowBusy.set(false);
    }
  }

  async setWorkflowEnabled(id: string, enabled: boolean): Promise<void> {
    try {
      await this.api.patchWorkflow(id, { enabled });
      await this.refreshWorkflows();
    } catch (e) {
      this.statusMessage.set(apiErrorInfo(e).message);
    }
  }

  async removeWorkflow(id: string): Promise<void> {
    try {
      await this.api.deleteWorkflow(id);
      await this.refreshWorkflows();
    } catch (e) {
      this.statusMessage.set(apiErrorInfo(e).message);
    }
  }

  openWorkflowActivity(): void {
    this.workflowActivityOpen.set(true);
  }

  closeWorkflowActivity(): void {
    this.workflowActivityOpen.set(false);
  }

  upsertWorkflowJob(job: WorkflowJob): void {
    this.workflowJobs.update((list) => {
      const i = list.findIndex((j) => j.id === job.id);
      if (i < 0) return [job, ...list].slice(0, 30);
      const next = list.slice();
      next[i] = job;
      return next;
    });
    if (job.status === 'queued' || job.status === 'running') {
      this.workflowActivityOpen.set(true);
    }
    if (job.output?.trim() && (job.status === 'done' || job.status === 'cancelled')) {
      this.openWorkflowReport(job);
    }
    if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') {
      void this.refreshWorkflows();
      void this.refreshNavMeta();
      void this.refreshThreads();
    }
  }

  openWorkflowReport(job: WorkflowJob): void {
    if (!job.output?.trim()) return;
    this.workflowReport.set({
      title: job.workflowName,
      body: job.output,
      jobId: job.id,
    });
    this.workflowReportOpen.set(true);
  }

  closeWorkflowReport(): void {
    this.workflowReportOpen.set(false);
  }

  liveWorkflowJob(workflowId: string): WorkflowJob | undefined {
    return this.workflowJobs().find(
      (j) =>
        j.workflowId === workflowId &&
        (j.status === 'queued' || j.status === 'running'),
    );
  }

  async stopWorkflowJob(jobId: string): Promise<void> {
    try {
      const res = await this.api.stopWorkflowJob(jobId);
      this.upsertWorkflowJob(res.job);
      this.statusMessage.set('Workflow stopped');
    } catch (e) {
      this.statusMessage.set(apiErrorInfo(e).message);
    }
  }

  async stopWorkflow(id: string): Promise<void> {
    try {
      const res = await this.api.stopWorkflow(id);
      for (const job of res.jobs ?? []) this.upsertWorkflowJob(job);
      if (res.jobs?.length) this.statusMessage.set('Workflow stopped');
    } catch (e) {
      this.statusMessage.set(apiErrorInfo(e).message);
    }
  }

  async runWorkflow(id: string, dryRun = false): Promise<void> {
    const wf = this.workflows().find((w) => w.id === id);
    try {
      const res = await this.api.runWorkflow(id, { dryRun, limit: 120 });
      this.upsertWorkflowJob(res.job);
      this.statusMessage.set(
        `${dryRun ? 'Dry run' : 'Run'} queued · ${wf?.name ?? 'workflow'}`,
      );
      this.workflowActivityOpen.set(true);
    } catch (e) {
      this.statusMessage.set(apiErrorInfo(e).message);
    }
  }

  toggleAccountMenu(): void {
    const opening = !this.accountMenuOpen();
    this.accountMenuOpen.set(opening);
    // Always re-sync which mailbox is active when the menu opens
    if (opening) void this.refreshAccounts();
  }

  closeAccountMenu(): void {
    this.accountMenuOpen.set(false);
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

  setFontFamily(fontFamily: FontFamily): void {
    const next = { ...this.theme(), fontFamily };
    this.theme.set(next);
    saveThemePrefs(next);
    applyTheme(next);
  }

  setFontSize(fontSize: FontSize): void {
    const next = { ...this.theme(), fontSize };
    this.theme.set(next);
    saveThemePrefs(next);
    applyTheme(next);
  }

  setUiLayout(uiLayout: UiLayout): void {
    const next = { ...this.theme(), uiLayout };
    this.theme.set(next);
    saveThemePrefs(next);
    applyTheme(next);
  }

  readonly fontFamilyOptions = FONT_FAMILY_OPTIONS;
  readonly fontSizeOptions = FONT_SIZE_OPTIONS;
  readonly uiLayoutOptions = UI_LAYOUT_OPTIONS;

  readonly suggestedReplies = computed(() => {
    const t = this.selectedThread();
    if (!t) return [] as string[];
    const last = t.messages.at(-1);
    const body = (last?.body || t.snippet || '').toLowerCase();
    const chips = ['Thanks', 'Sounds good', "I'll take a look"];
    if (/\?/.test(last?.body || t.snippet || '')) {
      chips.push("I'll get back to you");
    }
    if (body.includes('meet') || body.includes('call') || body.includes('calendar')) {
      chips.push('That time works');
    }
    return chips;
  });

  applySuggestedReply(text: string): void {
    this.setReplyBody(text);
    this.openReply();
  }

  setMailboxAskDraft(value: string): void {
    this.mailboxAskDraft.set(value);
  }

  openMailboxAsk(): void {
    this.mailboxAskOpen.set(true);
  }

  closeMailboxAsk(): void {
    this.mailboxAskOpen.set(false);
  }

  toggleMailboxAsk(): void {
    this.mailboxAskOpen.update((v) => !v);
  }

  backToList(): void {
    const keep = this.selectedId();
    if (keep) this.listCursorId.set(keep);
    this.selectedId.set(null);
    this.replyOpen.set(false);
    this.aiInsightOpen.set(false);
    this.closeMailboxAsk();
  }

  async sendMailboxAsk(): Promise<void> {
    const q = this.mailboxAskDraft().trim();
    if (!q || this.mailboxAskBusy()) return;
    const history = [
      ...this.mailboxAskMessages(),
      { role: 'user' as const, content: q },
    ];
    this.mailboxAskDraft.set('');
    this.mailboxAskMessages.set(history);
    this.mailboxAskBusy.set(true);
    this.mailboxAskError.set(null);
    try {
      const res = await this.api.aiAsk(q, history);
      this.mailboxAskMessages.set([
        ...history,
        { role: 'assistant', content: res.text },
      ]);
    } catch (e) {
      this.mailboxAskError.set(apiErrorInfo(e).message);
    } finally {
      this.mailboxAskBusy.set(false);
    }
  }

  private rememberRecentOpen(id: string): void {
    const t = this.threads().find((x) => x.id === id);
    if (!t) return;
    const entry = { id: t.id, subject: t.subject, from: t.from };
    const next = [
      entry,
      ...this.recentOpens().filter((r) => r.id !== id),
    ].slice(0, 8);
    this.recentOpens.set(next);
    try {
      writePref(RECENT_OPENS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  /** Live status line for Settings → Notifications. */
  readonly notifyStatus = signal<{
    state: NotifyPermissionState;
    runtime: 'tauri' | 'browser';
    label: string;
  } | null>(null);

  async refreshNotifyStatus(): Promise<void> {
    this.notifyStatus.set(await getNotifyPermissionState());
  }

  /** Cycle dark ↔ light (palette shortcut). */
  toggleTheme(): void {
    const mode: ThemeMode = this.theme().mode === 'light' ? 'dark' : 'light';
    this.setThemeMode(mode);
  }

  private listViewParams(): {
    q?: string;
    view: ApiThreadView;
    label?: string;
  } {
    if (this.searchActive() && this.searchQuery().trim()) {
      return { q: this.searchQuery(), view: 'all' };
    }
    const mv = this.mailView();
    if (mv === 'label' && this.activeLabelId()) {
      return { view: 'label', label: this.activeLabelId()! };
    }
    if (mv === 'custom') {
      return { q: this.searchQuery() || undefined, view: 'all' };
    }
    if (mv === 'sent' || mv === 'starred' || mv === 'all' || mv === 'inbox') {
      return { view: mv };
    }
    return { view: 'inbox' };
  }

  async refreshThreads(opts?: { skipFill?: boolean }): Promise<void> {
    if (this.coreStatus() === 'auth-expired') {
      this.clearMailbox();
      return;
    }
    this.listLoading.set(true);
    try {
      const res = await this.api.listThreads(this.listViewParams());
      if (res.authExpired) {
        this.handleAuthExpired('list');
        return;
      }
      if (res.account) {
        this.applyAccountSession({ account: res.account });
      }
      // Prefer server paging flags when present
      if (this.searchActive() && res.searchHasMore != null) {
        this.hasMoreMail.set(Boolean(res.searchHasMore));
      } else if (!this.searchActive() && res.inboxHasMore != null) {
        this.hasMoreMail.set(Boolean(res.inboxHasMore));
      }
      if (!res.threads.length) {
        this.clearMailbox();
        void setDockBadge(0);
        if (!this.statusMessage()?.startsWith('Found') && !this.statusMessage()?.startsWith('No Gmail')) {
          this.statusMessage.set(
            this.searchQuery()
              ? 'No matches in cache — try Enter to search Gmail.'
              : 'Inbox empty locally — try Sync.',
          );
        }
        return;
      }
      // Keep already-loaded message bodies — list refresh used to wipe them to []
      // and race with detail load ("No messages loaded for this thread").
      const prevById = new Map(this.threads().map((t) => [t.id, t]));
      // Drop threads mid-archive so SSE/sync cannot put the open one back.
      const pending = this.pendingArchiveIds;
      const mapped: ShellThreadPreview[] = res.threads
        .filter((t: ApiThread) => !pending.has(t.id))
        .map((t: ApiThread) => {
          const prev = prevById.get(t.id);
          return {
            id: t.id,
            from: t.from,
            subject: t.subject,
            snippet: t.snippet,
            time: t.time,
            unread: t.unread,
            starred: t.starred,
            hasAttachments: t.hasAttachments,
            messages: prev?.messages?.length ? prev.messages : [],
          };
        });
      this.threads.set(mapped);
      // Drop checks that are no longer in the list
      if (this.checkedIds().size) {
        const alive = new Set(mapped.map((t) => t.id));
        const next = new Set([...this.checkedIds()].filter((id) => alive.has(id)));
        if (next.size !== this.checkedIds().size) this.checkedIds.set(next);
      }
      void setDockBadge(mapped.filter((t) => t.unread).length);
      const keep = mapped.find((t) => t.id === this.selectedId());
      // List-first: stay on the inbox unless this thread is still in the list.
      // Split: keep the current thread or fall back to the first row.
      const nextId = this.isSplitLayout()
        ? (keep?.id ?? mapped[0]?.id ?? null)
        : (keep?.id ?? null);
      this.selectedId.set(nextId);
      const cursorKeep = mapped.find((t) => t.id === this.listCursorId());
      this.listCursorId.set(
        cursorKeep?.id ?? nextId ?? mapped[0]?.id ?? null,
      );
      // Top up list after archive / thin cache (async, non-blocking for selection)
      if (!opts?.skipFill) {
        void this.ensureListFilled();
      }
      if (nextId) {
        await this.loadThreadDetail(nextId);
      }
      // Don't clobber archive undo / search result banners
      if (!this.undoAvailable() && !this.listFilling()) {
        const msg = this.statusMessage();
        if (
          msg &&
          (msg.startsWith('Syncing') ||
            msg.startsWith('Loading') ||
            msg === 'Restoring…')
        ) {
          this.statusMessage.set(null);
        }
      }
    } catch (e) {
      this.statusMessage.set(
        e instanceof Error ? e.message : 'Failed to load threads',
      );
    } finally {
      this.listLoading.set(false);
    }
  }

  private detailLoadSeq = 0;

  async loadThreadDetail(id: string): Promise<void> {
    const seq = ++this.detailLoadSeq;
    this.detailLoading.set(true);
    try {
      const detail: ApiThreadDetail = await this.api.getThread(id);
      // Ignore stale responses if user clicked another thread
      if (seq !== this.detailLoadSeq || this.selectedId() !== id) return;

      this.threads.update((list) =>
        list.map((t) =>
          t.id === id
            ? {
                ...t,
                subject: detail.subject,
                from: detail.from,
                time: detail.time,
                unread: detail.unread,
                participants: detail.participants ?? t.participants,
                messages: detail.messages.map((m) => ({
                  id: m.id,
                  from: m.from,
                  to: m.to,
                  cc: m.cc ?? '',
                  bcc: m.bcc ?? '',
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
      if (!detail.messages.length) {
        this.statusMessage.set(
          'No messages in cache for this thread — try Sync',
        );
      }
    } catch (e) {
      if (seq !== this.detailLoadSeq) return;
      this.statusMessage.set(
        e instanceof Error ? e.message : 'Failed to load thread',
      );
    } finally {
      if (seq === this.detailLoadSeq) {
        this.detailLoading.set(false);
      }
    }
  }

  async selectThread(id: string): Promise<void> {
    // Per-thread remote-image unlock does not carry across threads
    if (this.remoteImagesUnlockedThreadId() !== id) {
      this.remoteImagesUnlockedThreadId.set(null);
    }
    if (this.selectedId() !== id) {
      this.resetAiChat();
      this.aiInsightOpen.set(false);
    }
    this.selectedId.set(id);
    this.listCursorId.set(id);
    this.rememberRecentOpen(id);
    this.threads.update((list) =>
      list.map((t) => (t.id === id ? { ...t, unread: false } : t)),
    );
    await this.loadThreadDetail(id);
  }

  isChecked(id: string): boolean {
    return this.checkedIds().has(id);
  }

  clearChecked(): void {
    this.checkedIds.set(new Set());
    this.lastCheckedAnchor = null;
  }

  /** Select every thread currently in the list. */
  selectAllVisible(): void {
    this.checkedIds.set(new Set(this.threads().map((t) => t.id)));
    const list = this.threads();
    this.lastCheckedAnchor = list[list.length - 1]?.id ?? null;
  }

  /**
   * Replace multi-select with the inclusive list range between two thread ids.
   * Used by click-drag selection and Shift-click ranges.
   */
  setCheckedRange(fromId: string, toId: string): void {
    const list = this.threads();
    const a = list.findIndex((t) => t.id === fromId);
    const b = list.findIndex((t) => t.id === toId);
    if (a < 0 || b < 0) return;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    const next = new Set<string>();
    for (let i = lo; i <= hi; i++) {
      next.add(list[i]!.id);
    }
    this.checkedIds.set(next);
    this.lastCheckedAnchor = toId;
  }

  /**
   * Thread list click with multi-select modifiers.
   * - plain: open thread (and clear multi-select)
   * - ⌘/Ctrl: toggle check without leaving current reading focus
   * - Shift: range check from last anchor
   * - click-drag: handled separately via setCheckedRange
   */
  async onThreadListClick(
    id: string,
    event: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean },
  ): Promise<void> {
    const multi = event.metaKey || event.ctrlKey;
    const range = event.shiftKey;

    if (range && this.lastCheckedAnchor) {
      this.setCheckedRange(this.lastCheckedAnchor, id);
      // Also focus the end of the range
      await this.selectThread(id);
      return;
    }

    if (multi) {
      const next = new Set(this.checkedIds());
      if (next.has(id)) next.delete(id);
      else next.add(id);
      this.checkedIds.set(next);
      this.lastCheckedAnchor = id;
      // Don't switch reading pane on pure multi-toggle unless nothing focused
      if (!this.selectedId()) await this.selectThread(id);
      return;
    }

    // Plain click: single focus + clear multi
    this.clearChecked();
    this.lastCheckedAnchor = id;
    await this.selectThread(id);
  }

  /**
   * Archive multi-select if any, otherwise the open/focused thread.
   * Always includes the open thread when multi-select is active so the
   * reading-pane conversation cannot be left behind.
   */
  async archiveSelected(): Promise<void> {
    const targets = new Set(this.checkedIds());
    const focused = this.focusedThreadId();
    if (focused) targets.add(focused);

    if (!targets.size) {
      this.statusMessage.set('Select a thread to archive.');
      return;
    }

    const ids = [...targets];
    if (ids.length === 1) {
      this.listCursorId.set(ids[0]!);
      this.clearChecked();
      await this.archiveFocusedOnly();
      return;
    }
    await this.archiveMany(ids);
  }

  private async archiveMany(ids: string[]): Promise<void> {
    if (!this.isConnected() || !ids.length) return;
    const idSet = new Set(ids);
    const list = this.threads();
    const remaining = list.filter((t) => !idSet.has(t.id));
    // Prefer the next thread after the open one, not always list top
    const focusIdx = list.findIndex((t) => t.id === this.selectedId());
    let nextFocus: string | null = null;
    if (focusIdx >= 0) {
      for (let i = focusIdx + 1; i < list.length; i++) {
        if (!idSet.has(list[i]!.id)) {
          nextFocus = list[i]!.id;
          break;
        }
      }
      if (!nextFocus) {
        for (let i = focusIdx - 1; i >= 0; i--) {
          if (!idSet.has(list[i]!.id)) {
            nextFocus = list[i]!.id;
            break;
          }
        }
      }
    }
    nextFocus ??= remaining[0]?.id ?? null;

    // Block list refresh from resurrecting these until Gmail confirms
    for (const id of ids) this.pendingArchiveIds.add(id);

    // Push undos for each removed thread (reverse order so z undoes last first)
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i]!;
      if (idSet.has(t.id)) this.pushArchiveUndo(t, i);
    }

    const wasReading = this.isSplitLayout() || Boolean(this.selectedId());
    this.threads.set(remaining);
    this.clearChecked();
    this.applyFocusAfterArchive(nextFocus, wasReading);
    this.statusMessage.set(
      `Archiving ${ids.length}… · z undoes (${this.undoCount()})`,
    );

    let ok = 0;
    const failed: string[] = [];
    try {
      for (const id of ids) {
        try {
          await this.api.archive(id);
          ok += 1;
        } catch {
          failed.push(id);
        }
      }
      this.statusMessage.set(
        failed.length
          ? `Archived ${ok}, failed ${failed.length}`
          : `Archived ${ok} · z to undo (${this.undoCount()})`,
      );
      // Allow failed ids back into the list on the next refresh
      for (const id of failed) this.pendingArchiveIds.delete(id);
      if (failed.length) await this.refreshThreads();
      else await this.ensureListFilled();
    } finally {
      // Clear only after refill so mid-flight SSE still filters them out
      for (const id of ids) this.pendingArchiveIds.delete(id);
    }
  }

  private async archiveFocusedOnly(): Promise<void> {
    const id = this.focusedThreadId();
    if (!id || !this.isConnected()) {
      this.statusMessage.set('Archive needs a connected Gmail inbox.');
      return;
    }
    const list = this.threads();
    const idx = list.findIndex((t) => t.id === id);
    if (idx < 0) {
      this.statusMessage.set('Select a thread to archive.');
      return;
    }
    const removed = list[idx]!;
    const wasReading = this.isSplitLayout() || this.selectedId() === id;

    this.pendingArchiveIds.add(id);

    // Optimistic remove + jump to next so `e e e` keeps triaging
    const next = list[idx + 1] ?? list[idx - 1] ?? null;
    this.threads.update((ts) => ts.filter((t) => t.id !== id));
    if (this.checkedIds().has(id)) {
      const c = new Set(this.checkedIds());
      c.delete(id);
      this.checkedIds.set(c);
    }
    this.applyFocusAfterArchive(next?.id ?? null, wasReading);

    this.pushArchiveUndo(removed, idx);
    this.statusMessage.set(
      this.undoCount() > 1
        ? `Archived · z undoes (${this.undoCount()} stacked)`
        : 'Archived — press z to undo',
    );

    try {
      await this.api.archive(id);
      // Only refill after Gmail + local DB have dropped INBOX
      await this.ensureListFilled();
    } catch (e) {
      // Drop matching undo entry
      this.archiveUndoStack = this.archiveUndoStack.filter(
        (entry) => entry.thread.id !== id,
      );
      this.syncUndoSignals();
      this.handleGmailFailure(e, 'Archive failed');
      this.pendingArchiveIds.delete(id);
      await this.refreshThreads();
    } finally {
      this.pendingArchiveIds.delete(id);
    }
  }

  selectNext(): void {
    this.moveListCursor(1);
  }

  selectPrevious(): void {
    this.moveListCursor(-1);
  }

  /** Open the highlighted row (Enter / →). */
  openFocusedThread(): void {
    const id = this.focusedThreadId();
    if (id) void this.selectThread(id);
  }

  isListCursor(id: string): boolean {
    return this.listCursorId() === id || this.focusedThreadId() === id;
  }

  /**
   * Move the list highlight. Opens the thread when the reading pane is
   * already showing (split, or list-first after Enter) so j/k and arrows
   * keep working while reading. On the inbox list, only the cursor moves.
   */
  moveListCursor(delta: 1 | -1): void {
    const list = this.threads();
    if (!list.length) return;
    const cur = this.listCursorId() ?? this.selectedId();
    let idx = list.findIndex((t) => t.id === cur);
    if (idx < 0) idx = delta > 0 ? -1 : 0;
    const nextIdx = Math.max(0, Math.min(list.length - 1, idx + delta));
    const next = list[nextIdx];
    if (!next) return;
    this.listCursorId.set(next.id);
    this.lastCheckedAnchor = next.id;
    if (this.isSplitLayout() || this.selectedId()) {
      void this.selectThread(next.id);
    }
  }

  /** After archive: stay on the list in list-first; keep reading in split. */
  private applyFocusAfterArchive(nextId: string | null, keepReading: boolean): void {
    if (nextId) {
      this.listCursorId.set(nextId);
      if (keepReading) void this.selectThread(nextId);
      else this.selectedId.set(null);
      return;
    }
    this.listCursorId.set(null);
    this.selectedId.set(null);
    this.replyOpen.set(false);
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
        if (status.connected && status.email && !status.authExpired) {
          this.applyAccountSession({
            accounts: status.accounts ?? [],
            activeId: status.accountId ?? null,
            account: { id: status.accountId, email: status.email },
          });
          this.coreStatus.set('online-connected');
          this.authRedirectInFlight = false;
          this.statusMessage.set(
            `Connected as ${status.email}. Syncing inbox…`,
          );
          this.connectLiveEvents();
          this.startBackgroundSync();
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
      const res = await this.api.sync(full, { maxThreads: 100 });
      this.hasMoreMail.set(Boolean(res.hasMore));
      this.statusMessage.set(
        `Synced ${res.synced} (${res.mode ?? 'full'}) for ${res.email}`,
      );
      this.ingestNewMailNotices(res.newMail);
      await this.refreshThreads();
      void this.refreshNavMeta();
    } catch (e) {
      this.handleGmailFailure(e, 'Sync failed');
    } finally {
      this.syncing.set(false);
    }
  }

  /**
   * Next page: either more Gmail search hits or older inbox threads.
   * Safe to call from infinite scroll / auto-fill.
   */
  async loadMoreMail(opts?: { quiet?: boolean }): Promise<boolean> {
    if (!this.isConnected() || this.loadingMore() || this.syncing() || this.searching()) {
      return false;
    }
    if (!this.hasMoreMail()) return false;

    this.loadingMore.set(true);
    let got = 0;
    try {
      if (this.searchActive() && this.searchQuery().trim()) {
        const res = await this.api.searchGmail(this.searchQuery().trim(), {
          more: true,
          maxResults: 40,
        });
        this.hasMoreMail.set(Boolean(res.hasMore));
        got = res.synced;
        await this.refreshThreads({ skipFill: true });
        if (!opts?.quiet && res.synced > 0) {
          this.statusMessage.set(`Loaded ${res.synced} more search hit(s)`);
        }
      } else {
        const res = await this.api.sync(false, { more: true, maxThreads: 100 });
        this.hasMoreMail.set(Boolean(res.hasMore));
        got = res.synced;
        await this.refreshThreads({ skipFill: true });
        if (!opts?.quiet) {
          if (res.synced > 0) {
            this.statusMessage.set(`Loaded ${res.synced} more thread(s)`);
          } else if (!res.hasMore) {
            this.statusMessage.set('End of inbox from Gmail');
          }
        }
      }
      return got > 0;
    } catch (e) {
      if (!opts?.quiet) {
        this.statusMessage.set(
          e instanceof Error ? e.message : 'Load more failed',
        );
      }
      return false;
    } finally {
      this.loadingMore.set(false);
    }
  }

  /**
   * Keep the list near `listTarget` (100) threads when possible.
   * After archive the list shrinks — pull the next Gmail page(s) or re-sync
   * the top of inbox so the viewport stays full. If Gmail has fewer total,
   * the list stays smaller.
   */
  async ensureListFilled(): Promise<void> {
    if (this.listFillInFlight || !this.isConnected()) return;
    if (this.syncing() || this.searching()) return;
    // Only auto-fill inbox (and active Gmail search); not starred/all alone
    const fillingSearch = this.searchActive() && !!this.searchQuery().trim();
    if (!fillingSearch && this.mailView() !== 'inbox') return;

    if (this.threads().length >= this.listTarget) return;

    this.listFillInFlight = true;
    this.listFilling.set(true);
    try {
      let rounds = 0;
      const maxRounds = 6;

      while (
        this.threads().length < this.listTarget &&
        rounds < maxRounds &&
        this.isConnected()
      ) {
        rounds += 1;
        const before = this.threads().length;

        if (this.hasMoreMail()) {
          const got = await this.loadMoreMail({ quiet: true });
          if (!got && !this.hasMoreMail()) break;
          if (this.threads().length <= before && !this.hasMoreMail()) break;
          continue;
        }

        // No next-page token: re-pull top of inbox (current Gmail INBOX).
        // After archives, that restocks the list with remaining mail.
        if (!fillingSearch && rounds <= 2) {
          try {
            const res = await this.api.sync(true, { maxThreads: this.listTarget });
            this.hasMoreMail.set(Boolean(res.hasMore));
            await this.refreshThreads({ skipFill: true });
          } catch {
            break;
          }
          // If still thin and no more pages, Gmail simply has fewer than target
          if (!this.hasMoreMail()) break;
          continue;
        }

        break;
      }
    } finally {
      this.listFillInFlight = false;
      this.listFilling.set(false);
    }
  }

  /** Called when thread list scrolls near the bottom. */
  onThreadListScrollNearBottom(): void {
    if (this.loadingMore() || this.listFilling()) return;
    if (this.hasMoreMail()) {
      void this.loadMoreMail();
    } else if (this.threads().length < this.listTarget) {
      void this.ensureListFilled();
    }
  }

  /**
   * Fetch new mail now (history). Used on window focus / pull-to-refresh at top.
   * Throttled so focus spam doesn't hammer Gmail.
   */
  private lastFetchNewAt = 0;
  fetchNewMailNow(reason = 'manual'): void {
    if (!this.isConnected() || this.syncing() || this.sending()) return;
    const now = Date.now();
    if (now - this.lastFetchNewAt < 8_000) return;
    this.lastFetchNewAt = now;
    console.info('[sync] fetch new', reason);
    void this.quietSync();
  }

  async addComposeFiles(fileList: FileList | null): Promise<void> {
    const next = await filesToPending(fileList);
    if (next.length) {
      this.composeAttachments.update((cur) => [...cur, ...next]);
    }
  }

  removeComposeAttachment(id: string): void {
    this.composeAttachments.update((list) => list.filter((a) => a.id !== id));
  }

  async addReplyFiles(fileList: FileList | null): Promise<void> {
    const next = await filesToPending(fileList);
    if (next.length) {
      this.replyAttachments.update((cur) => [...cur, ...next]);
    }
  }

  removeReplyAttachment(id: string): void {
    this.replyAttachments.update((list) => list.filter((a) => a.id !== id));
  }

  /** Restore the most recently archived thread (hotkey `z`); stack supports multi-step. */
  async undoArchive(): Promise<void> {
    const pending = this.archiveUndoStack.pop();
    if (pending) clearTimeout(pending.timer);
    this.syncUndoSignals();

    if (!pending || !this.isConnected()) {
      if (!this.undoAvailable()) {
        this.statusMessage.set('Nothing to undo');
      }
      return;
    }

    const { thread, index } = pending;

    // Optimistic restore at original list position
    this.threads.update((list) => {
      if (list.some((t) => t.id === thread.id)) return list;
      const next = [...list];
      next.splice(Math.min(index, next.length), 0, thread);
      return next;
    });
    this.selectedId.set(thread.id);
    this.statusMessage.set(
      this.undoCount()
        ? `Restoring… (${this.undoCount()} more undo)`
        : 'Restoring…',
    );

    try {
      await this.api.unarchive(thread.id);
      this.statusMessage.set(
        this.undoCount()
          ? `Restored · ${this.undoCount()} more on z`
          : 'Restored to inbox',
      );
      await this.loadThreadDetail(thread.id);
      await this.refreshThreads();
      if (this.threads().some((t) => t.id === thread.id)) {
        this.selectedId.set(thread.id);
      }
    } catch (e) {
      this.handleGmailFailure(e, 'Undo failed');
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
      this.handleGmailFailure(e, 'Star failed');
      await this.refreshThreads();
    }
  }

  /** Mark the focused thread unread (`u`) without leaving selection. */
  async markUnreadSelected(): Promise<void> {
    const id = this.selectedId();
    if (!id || !this.isConnected()) return;
    this.threads.update((list) =>
      list.map((x) => (x.id === id ? { ...x, unread: true } : x)),
    );
    void setDockBadge(this.threads().filter((t) => t.unread).length);
    try {
      await this.api.markUnread(id);
      this.statusMessage.set('Marked unread');
    } catch (e) {
      this.handleGmailFailure(e, 'Mark unread failed');
      await this.refreshThreads();
    }
  }

  focusSearch(): void {
    this.closeCommandPalette();
    this.closeSettings();
    this.closeHelp();
    this.closeAccountMenu();
    this.searchFocusNonce.update((n) => n + 1);
  }

  openHelp(): void {
    this.helpOpen.set(true);
    this.closeCommandPalette();
    this.closeSettings();
    this.closeAccountMenu();
  }

  closeHelp(): void {
    this.helpOpen.set(false);
  }

  toggleHelp(): void {
    if (this.helpOpen()) this.closeHelp();
    else this.openHelp();
  }

  /**
   * In-app attachment viewer (images, PDF, text; other = open/download card).
   * Prefer this over raw window.open so Tauri/webview stay consistent.
   */
  readonly attachmentPreview = signal<AttachmentPreviewState | null>(null);

  /** @deprecated use attachmentPreview */
  readonly imagePreview = this.attachmentPreview;

  openAttachment(
    attId: string,
    opts?: { kind?: string; name?: string; mimeType?: string; sizeLabel?: string },
  ): void {
    const url = this.api.attachmentUrl(attId);
    const name = opts?.name || 'attachment';
    const kind = opts?.kind || 'other';
    const mime = (opts?.mimeType || '').toLowerCase();
    const view = resolveAttachmentView(kind, mime, name);
    const state: AttachmentPreviewState = {
      id: attId,
      url,
      name,
      kind,
      mimeType: mime,
      sizeLabel: opts?.sizeLabel || '',
      view,
      kindLabel: kindLabel(kind, mime),
      icon: iconForKind(kind),
      textContent: '',
      textLoading: view === 'text',
      textError: null,
    };
    this.attachmentPreview.set(state);

    if (view === 'text') {
      void this.loadTextAttachment(attId, url);
    }
  }

  private async loadTextAttachment(attId: string, url: string): Promise<void> {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // Cap huge files in the viewer
      const capped =
        text.length > 400_000
          ? text.slice(0, 400_000) + '\n\n… (truncated for preview)'
          : text;
      this.attachmentPreview.update((p) =>
        p && p.id === attId
          ? { ...p, textContent: capped, textLoading: false, textError: null }
          : p,
      );
    } catch (e) {
      this.attachmentPreview.update((p) =>
        p && p.id === attId
          ? {
              ...p,
              textLoading: false,
              textError:
                e instanceof Error ? e.message : 'Could not load text preview',
            }
          : p,
      );
    }
  }

  /**
   * Bumped when the reading pane should jump to the top (e.g. after closing
   * the full image / attachment viewer).
   */
  readonly scrollReadingToTopNonce = signal(0);

  requestScrollReadingToTop(): void {
    this.scrollReadingToTopNonce.update((n) => n + 1);
  }

  closeAttachmentPreview(): void {
    this.attachmentPreview.set(null);
    // After closing a full-size image/PDF viewer, return to the top of the thread
    this.requestScrollReadingToTop();
  }

  /** @deprecated use closeAttachmentPreview */
  closeImagePreview(): void {
    this.closeAttachmentPreview();
  }

  downloadAttachment(attId: string): void {
    const url = `${this.api.attachmentUrl(attId)}?download=1`;
    window.open(url, '_blank', 'noopener,noreferrer');
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
    const model = this.aiConfig()?.roles['summarize']?.model
      ?? this.aiStatus()?.model
      ?? 'Ollama';
    this.aiBusy.set(true);
    this.aiInsightError.set(null);
    this.aiInsightText.set('');
    this.aiChatMessages.set([]);
    this.aiInsightMode.set('ollama');
    this.aiInsightOpen.set(true);
    this.statusMessage.set(`Summarizing with ${model}…`);
    try {
      const res = await this.api.aiSummarize(id);
      this.aiInsightText.set(res.text);
      this.aiInsightMode.set(res.mode ?? 'ollama');
      this.aiChatMessages.set([{ role: 'assistant', content: res.text }]);
      this.statusMessage.set(
        res.mode === 'template'
          ? 'Summary ready (template — Ollama not available)'
          : `Summary ready (${res.mode}${res.model ? ' · ' + res.model : ''})`,
      );
    } catch (e) {
      const info = apiErrorInfo(e);
      if (info.authExpired) {
        this.handleAuthExpired('ai-summarize');
        return;
      }
      this.aiInsightError.set(info.message || 'Summarize failed');
      this.statusMessage.set(info.message || 'Summarize failed');
    } finally {
      this.aiBusy.set(false);
    }
  }

  async sendAiChat(): Promise<void> {
    const id = this.selectedId();
    const q = this.aiChatDraft().trim();
    if (!id || !q || this.aiChatBusy() || this.aiBusy()) return;
    const history = [
      ...this.aiChatMessages(),
      { role: 'user' as const, content: q },
    ];
    this.aiChatMessages.set(history);
    this.aiChatDraft.set('');
    this.aiChatBusy.set(true);
    this.aiInsightError.set(null);
    try {
      const res = await this.api.aiChat(id, history);
      this.aiChatMessages.set([
        ...history,
        { role: 'assistant', content: res.text },
      ]);
      this.aiInsightMode.set(res.mode ?? this.aiInsightMode());
    } catch (e) {
      const info = apiErrorInfo(e);
      if (info.authExpired) {
        this.handleAuthExpired('ai-chat');
        return;
      }
      this.aiInsightError.set(info.message || 'Chat failed');
    } finally {
      this.aiChatBusy.set(false);
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
      this.composeOpen.set(false);
      this.statusMessage.set(`Draft ready (${res.mode})`);
    } catch (e) {
      this.handleGmailFailure(e, 'AI failed');
    } finally {
      this.aiBusy.set(false);
    }
  }

  openReply(opts?: {
    all?: boolean;
    messageId?: string;
    quote?: string;
  }): void {
    if (!this.isConnected() || !this.selectedId()) return;
    this.replyAll.set(Boolean(opts?.all));
    this.replyToMessageId.set(opts?.messageId ?? null);
    const quote = (opts?.quote ?? '').trim();
    if (quote) {
      const quoted = quote
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      const prev = this.replyBody().trim();
      this.replyBody.set(prev ? `${prev}\n\n${quoted}\n` : `${quoted}\n\n`);
    }
    this.replyOpen.set(true);
    this.composeOpen.set(false);
  }

  openReplyAll(opts?: { messageId?: string; quote?: string }): void {
    this.openReply({ ...opts, all: true });
  }

  closeReply(): void {
    this.replyOpen.set(false);
    this.replyAll.set(false);
    this.replyToMessageId.set(null);
    this.replyAttachments.set([]);
  }

  openCompose(): void {
    if (!this.isConnected()) {
      this.statusMessage.set('Connect Gmail first.');
      return;
    }
    this.replyOpen.set(false);
    this.composeOpen.set(true);
    this.commandPaletteOpen.set(false);
  }

  closeCompose(opts?: { discard?: boolean }): void {
    if (
      !opts?.discard &&
      this.composeIsDirty() &&
      !confirm('Discard this draft?')
    ) {
      return;
    }
    this.clearContactSuggestions();
    this.composeOpen.set(false);
  }

  /** True when compose has any user-entered content. */
  composeIsDirty(): boolean {
    return Boolean(
      this.composeTo().trim() ||
        this.composeCc().trim() ||
        this.composeSubject().trim() ||
        this.composeBody().trim() ||
        this.composeAttachments().length,
    );
  }

  discardCompose(): void {
    this.composeTo.set('');
    this.composeCc.set('');
    this.composeSubject.set('');
    this.composeBody.set('');
    this.composeShowCc.set(false);
    this.composeAttachments.set([]);
    this.clearContactSuggestions();
    this.composeOpen.set(false);
  }

  showComposeCc(): void {
    this.composeShowCc.set(true);
  }

  setReplyBody(value: string): void {
    this.replyBody.set(value);
  }

  setComposeTo(v: string): void {
    this.composeTo.set(v);
    this.scheduleContactSuggest('to', v);
  }
  setComposeCc(v: string): void {
    this.composeCc.set(v);
    this.scheduleContactSuggest('cc', v);
  }
  setComposeSubject(v: string): void {
    this.composeSubject.set(v);
  }
  setComposeBody(v: string): void {
    this.composeBody.set(v);
  }

  clearContactSuggestions(): void {
    if (this.contactSuggestTimer) {
      clearTimeout(this.contactSuggestTimer);
      this.contactSuggestTimer = null;
    }
    this.contactSuggestions.set([]);
    this.contactSuggestField.set(null);
    this.contactSuggestHighlight.set(0);
  }

  /**
   * Suggest recipients from addresses already seen in synced mail history.
   * Uses the segment after the last comma so multi-recipient fields work.
   */
  private scheduleContactSuggest(field: 'to' | 'cc', raw: string): void {
    if (this.contactSuggestTimer) clearTimeout(this.contactSuggestTimer);
    const segment = raw.split(',').pop()?.trim() ?? '';
    if (segment.length < 1) {
      this.clearContactSuggestions();
      return;
    }
    this.contactSuggestTimer = setTimeout(() => {
      void this.runContactSuggest(field, segment);
    }, 120);
  }

  private async runContactSuggest(
    field: 'to' | 'cc',
    segment: string,
  ): Promise<void> {
    if (!this.isConnected()) return;
    const seq = ++this.contactSuggestSeq;
    try {
      const res = await this.api.suggestContacts(segment, 8);
      if (seq !== this.contactSuggestSeq) return;
      this.contactSuggestField.set(field);
      this.contactSuggestions.set(res.contacts);
      this.contactSuggestHighlight.set(0);
    } catch {
      if (seq === this.contactSuggestSeq) {
        this.contactSuggestions.set([]);
      }
    }
  }

  moveContactHighlight(delta: number): void {
    const list = this.contactSuggestions();
    if (!list.length) return;
    const next =
      (this.contactSuggestHighlight() + delta + list.length) % list.length;
    this.contactSuggestHighlight.set(next);
  }

  /** Apply highlighted or given contact into the active To/Cc field. */
  pickContactSuggestion(contact?: {
    email: string;
    name: string;
  }): void {
    const field = this.contactSuggestField();
    const list = this.contactSuggestions();
    const chosen =
      contact ?? list[this.contactSuggestHighlight()] ?? list[0] ?? null;
    if (!field || !chosen) return;

    const current = field === 'to' ? this.composeTo() : this.composeCc();
    const parts = current.split(',');
    parts[parts.length - 1] = ` ${chosen.email}`;
    const next = parts
      .map((p) => p.trim())
      .filter(Boolean)
      .join(', ');

    if (field === 'to') this.composeTo.set(next);
    else this.composeCc.set(next);
    this.clearContactSuggestions();
  }

  async sendCompose(): Promise<void> {
    if (!this.isConnected()) return;
    const to = this.composeTo().trim();
    const body = this.composeBody().trim();
    if (!to) {
      this.statusMessage.set('Add a recipient in To');
      return;
    }
    if (!body) {
      this.statusMessage.set('Write a message before sending');
      return;
    }
    this.sending.set(true);
    try {
      const attachments = this.composeAttachments().map((a) => ({
        filename: a.name,
        mimeType: a.mimeType,
        contentBase64: a.contentBase64,
      }));
      await this.api.sendNew(
        to,
        this.composeSubject(),
        body,
        this.composeCc().trim() || undefined,
        attachments.length ? attachments : undefined,
      );
      this.composeTo.set('');
      this.composeCc.set('');
      this.composeSubject.set('');
      this.composeBody.set('');
      this.composeShowCc.set(false);
      this.composeAttachments.set([]);
      this.clearContactSuggestions();
      this.composeOpen.set(false);
      this.statusMessage.set('Message sent');
      // Pull history soon so self-mail / replies can raise notifications without waiting 60s
      window.setTimeout(() => void this.quietSync(), 4_000);
      window.setTimeout(() => void this.quietSync(), 12_000);
    } catch (e) {
      this.handleGmailFailure(e, 'Send failed');
    } finally {
      this.sending.set(false);
    }
  }

  /** OAuth add/connect another Google account (becomes active). */
  addAccount(): void {
    void this.connectGmail();
  }

  async switchAccount(accountId: number): Promise<void> {
    const id = Number(accountId);
    if (id === Number(this.activeAccountId())) return;
    this.statusMessage.set('Switching account…');
    try {
      const res = await this.api.setActiveAccount(id);
      this.applyAccountSession({
        account: res.account,
        activeId: res.account.id,
      });
      // Refresh full list so ✓ stays correct if another was added mid-session
      await this.refreshAccounts();
      this.clearMailbox();
      await this.refreshThreads();
      void this.refreshNavMeta();
      this.statusMessage.set(`Switched to ${res.account.email}`);
    } catch (e) {
      this.statusMessage.set(e instanceof Error ? e.message : 'Switch failed');
    }
  }

  async removeActiveAccount(): Promise<void> {
    const id = this.activeAccountId();
    if (id == null) return;
    if (!confirm(`Remove account ${this.accountEmail()} from Docket?`)) {
      return;
    }
    try {
      const res = await this.api.removeAccount(id);
      this.applyAccountSession({ accounts: res.accounts });
      if (res.accounts.length) {
        await this.switchAccount(Number(res.accounts[0]!.id));
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
      case 'undo':
        void this.undoArchive();
        break;
      case 'reply':
        this.openReply();
        break;
      case 'reply-all':
        this.openReplyAll();
        break;
      case 'compose':
        this.openCompose();
        break;
      case 'sync':
        void this.syncNow();
        break;
      case 'test-notify':
        void this.testNotification();
        break;
      case 'star':
        void this.toggleStarSelected();
        break;
      case 'unread':
        void this.markUnreadSelected();
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
      case 'layout':
        this.setUiLayout(this.theme().uiLayout === 'list' ? 'split' : 'list');
        break;
      case 'ask-ai':
        this.toggleMailboxAsk();
        break;
      case 'settings':
        this.openSettings();
        break;
      case 'workflows':
        this.openWorkflows();
        break;
      case 'help':
        this.openHelp();
        break;
      case 'search':
        this.focusSearch();
        break;
      case 'inbox':
        void this.setMailView('inbox');
        break;
      case 'starred':
        void this.setMailView('starred');
        break;
      case 'all':
        void this.setMailView('all');
        break;
      case 'sent':
        void this.setMailView('sent');
        break;
      case 'save-view':
        void this.addCustomViewFromSearch();
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
      const attachments = this.replyAttachments().map((a) => ({
        filename: a.name,
        mimeType: a.mimeType,
        contentBase64: a.contentBase64,
      }));
      await this.api.reply(
        id,
        body,
        attachments.length ? attachments : undefined,
        this.replyAll(),
        this.replyToMessageId() ?? undefined,
      );
      this.replyBody.set('');
      this.replyAttachments.set([]);
      this.statusMessage.set('Sent');
      await this.loadThreadDetail(id);
      window.setTimeout(() => void this.quietSync(), 4_000);
    } catch (e) {
      this.handleGmailFailure(e, 'Send failed');
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

const MAX_ATTACH_BYTES = 8 * 1024 * 1024; // 8 MB per file (JSON + base64 overhead)

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function filesToPending(
  fileList: FileList | null,
): Promise<PendingAttachment[]> {
  if (!fileList?.length) return [];
  const out: PendingAttachment[] = [];
  for (const file of Array.from(fileList)) {
    if (file.size > MAX_ATTACH_BYTES) {
      console.warn(`[attach] skip ${file.name}: over 8 MB`);
      continue;
    }
    const contentBase64 = await readFileAsBase64(file);
    out.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeLabel: formatFileSize(file.size),
      contentBase64,
    });
  }
  return out;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}
