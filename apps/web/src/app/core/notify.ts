/**
 * Cross-platform notifications:
 * - Tauri Dock app → native macOS Notification Center
 * - Browser → Web Notification API
 */

export interface MailNotifyPayload {
  title: string;
  body: string;
  /** Local composite thread id — open on click when supported. */
  threadId?: string;
}

type OpenThreadHandler = (threadId: string) => void;

let openThreadHandler: OpenThreadHandler | null = null;
let tauriActionHooked = false;

export function onNotifyOpenThread(handler: OpenThreadHandler): void {
  openThreadHandler = handler;
}

function isTauri(): boolean {
  const w = window as unknown as {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
    isTauri?: boolean;
  };
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__ || w.isTauri);
}

async function ensureTauriPermission(): Promise<boolean> {
  try {
    const {
      isPermissionGranted,
      requestPermission,
    } = await import('@tauri-apps/plugin-notification');
    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === 'granted';
    }
    return granted;
  } catch {
    return false;
  }
}

async function hookTauriActionOnce(): Promise<void> {
  if (tauriActionHooked || !isTauri()) return;
  tauriActionHooked = true;
  try {
    const { onAction } = await import('@tauri-apps/plugin-notification');
    await onAction((notification) => {
      const extra = (notification as { extra?: Record<string, unknown> }).extra;
      const threadId =
        (extra?.['threadId'] as string | undefined) ||
        (notification as { extra?: { threadId?: string } }).extra?.threadId;
      if (threadId && openThreadHandler) {
        openThreadHandler(threadId);
      }
    });
  } catch {
    /* onAction may be limited on desktop — focus app still works */
  }
}

async function focusMainWindow(): Promise<void> {
  if (!isTauri()) {
    window.focus();
    return;
  }
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    await win.show();
    await win.unminimize();
    await win.setFocus();
  } catch {
    window.focus();
  }
}

/** Request permission early (browser or Tauri). */
export async function requestNotifyPermission(): Promise<void> {
  if (isTauri()) {
    await ensureTauriPermission();
    await hookTauriActionOnce();
    return;
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

/**
 * Show a system notification. Prefer native in Tauri; fall back to Web API.
 */
export async function showNotification(payload: MailNotifyPayload): Promise<void> {
  const { title, body, threadId } = payload;

  if (isTauri()) {
    try {
      const granted = await ensureTauriPermission();
      await hookTauriActionOnce();
      if (!granted) return;
      const { sendNotification } = await import('@tauri-apps/plugin-notification');
      sendNotification({
        title,
        body,
        extra: threadId ? { threadId } : undefined,
      });
      return;
    } catch (e) {
      console.warn('[notify] Tauri notification failed, trying Web API', e);
    }
  }

  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  try {
    const n = new Notification(title, {
      body,
      tag: threadId ? `thread-${threadId}` : undefined,
      data: threadId ? { threadId } : undefined,
    });
    n.onclick = () => {
      void focusMainWindow();
      if (threadId && openThreadHandler) openThreadHandler(threadId);
      n.close();
    };
  } catch {
    /* ignore */
  }
}

/** Set Dock badge unread count when running under Tauri (no-op in browser). */
export async function setDockBadge(count: number): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
    // Tauri 2 window badge API (macOS / some Linux)
    const w = win as unknown as {
      setBadgeCount?: (n: number | null) => Promise<void>;
    };
    if (typeof w.setBadgeCount === 'function') {
      await w.setBadgeCount(count > 0 ? count : null);
    }
  } catch {
    /* badge unsupported */
  }
}
