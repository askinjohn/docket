/**
 * Cross-platform notifications:
 * - Tauri Dock app → native macOS Notification Center
 * - Browser / fallback → Web Notification API
 *
 * Never silently drop: if Tauri path fails, try Web API.
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
    const { isPermissionGranted, requestPermission } = await import(
      '@tauri-apps/plugin-notification'
    );
    let granted = await isPermissionGranted();
    if (!granted) {
      const perm = await requestPermission();
      granted = perm === 'granted';
    }
    return granted;
  } catch (e) {
    console.warn('[notify] Tauri notification plugin unavailable', e);
    return false;
  }
}

async function hookTauriActionOnce(): Promise<void> {
  if (tauriActionHooked || !isTauri()) return;
  tauriActionHooked = true;
  try {
    const { onAction } = await import('@tauri-apps/plugin-notification');
    await onAction((notification: { extra?: Record<string, unknown> }) => {
      const threadId = notification.extra?.['threadId'];
      if (typeof threadId === 'string' && openThreadHandler) {
        openThreadHandler(threadId);
      }
    });
  } catch {
    /* onAction may be limited on desktop */
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

function showWebNotification(payload: MailNotifyPayload): boolean {
  if (typeof Notification === 'undefined') {
    console.warn('[notify] Web Notification API not available');
    return false;
  }
  if (Notification.permission === 'default') {
    void Notification.requestPermission().then((p) => {
      if (p === 'granted') showWebNotification(payload);
    });
    return false;
  }
  if (Notification.permission !== 'granted') {
    console.warn('[notify] Web Notification permission not granted');
    return false;
  }

  try {
    const n = new Notification(payload.title, {
      body: payload.body,
      tag: payload.threadId ? `thread-${payload.threadId}` : undefined,
      data: payload.threadId ? { threadId: payload.threadId } : undefined,
    });
    n.onclick = () => {
      void focusMainWindow();
      if (payload.threadId && openThreadHandler) {
        openThreadHandler(payload.threadId);
      }
      n.close();
    };
    console.info('[notify] Web notification shown', payload.title);
    return true;
  } catch (e) {
    console.warn('[notify] Web Notification failed', e);
    return false;
  }
}

/** Request permission early (browser or Tauri). */
export async function requestNotifyPermission(): Promise<void> {
  if (isTauri()) {
    const ok = await ensureTauriPermission();
    await hookTauriActionOnce();
    if (!ok && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    return;
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

/**
 * Show a system notification. Prefer native in Tauri; always fall back to Web API.
 */
export async function showNotification(payload: MailNotifyPayload): Promise<void> {
  const { title, body, threadId } = payload;
  console.info('[notify] show requested', title, body?.slice?.(0, 80));

  if (isTauri()) {
    try {
      const granted = await ensureTauriPermission();
      await hookTauriActionOnce();
      if (granted) {
        const { sendNotification } = await import(
          '@tauri-apps/plugin-notification'
        );
        sendNotification({
          title,
          body,
          extra: threadId ? { threadId } : undefined,
        });
        console.info('[notify] Tauri notification sent', title);
        return;
      }
      console.warn(
        '[notify] Tauri permission denied — trying Web Notification fallback',
      );
    } catch (e) {
      console.warn('[notify] Tauri path failed, trying Web API', e);
    }
  }

  showWebNotification(payload);
}

/** Set Dock badge unread count when running under Tauri (no-op in browser). */
export async function setDockBadge(count: number): Promise<void> {
  if (!isTauri()) return;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const win = getCurrentWindow();
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
