/**
 * Cross-platform notifications:
 * - Tauri Dock app → native plugin (`plugin:notification|notify`)
 * - Fallback → Web Notification API
 *
 * Prefer the native invoke path: the plugin’s JS `sendNotification()` only wraps
 * `new Notification()`, which is unreliable if the polyfill hasn’t loaded yet.
 */

export interface MailNotifyPayload {
  title: string;
  body: string;
  /** Local composite thread id — open on click when supported. */
  threadId?: string;
}

export type NotifyChannel = 'tauri-native' | 'tauri-api' | 'web' | 'none';

export interface NotifyResult {
  ok: boolean;
  channel: NotifyChannel;
  detail: string;
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
    console.warn('[notify] Tauri permission check failed', e);
    // Desktop plugin always grants on the Rust side — try send anyway
    return isTauri();
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
    console.warn('[notify] Web Notification permission not granted:', Notification.permission);
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

export type NotifyPermissionState =
  | 'granted'
  | 'denied'
  | 'default'
  | 'unsupported'
  | 'tauri-pending';

/** Snapshot of notification permission (best-effort for Settings UI). */
export async function getNotifyPermissionState(): Promise<{
  state: NotifyPermissionState;
  runtime: 'tauri' | 'browser';
  label: string;
}> {
  const runtime: 'tauri' | 'browser' = isTauri() ? 'tauri' : 'browser';
  if (isTauri()) {
    try {
      const { isPermissionGranted } = await import(
        '@tauri-apps/plugin-notification'
      );
      const granted = await isPermissionGranted();
      if (granted) {
        return {
          state: 'granted',
          runtime,
          label: 'Dock app · notifications allowed (also check System Settings → Notifications → Local Mail)',
        };
      }
      return {
        state: 'default',
        runtime,
        label: 'Dock app · click Test to request permission',
      };
    } catch {
      return {
        state: 'unsupported',
        runtime,
        label: 'Dock app · notification plugin unavailable — rebuild desktop app',
      };
    }
  }
  if (typeof Notification === 'undefined') {
    return {
      state: 'unsupported',
      runtime,
      label: 'Browser · Notification API not available',
    };
  }
  const p = Notification.permission;
  if (p === 'granted') {
    return {
      state: 'granted',
      runtime,
      label: 'Browser · allowed (alerts appear under Chrome/Safari, not as “Local Mail”)',
    };
  }
  if (p === 'denied') {
    return {
      state: 'denied',
      runtime,
      label: 'Browser · blocked — enable in site settings for this origin',
    };
  }
  return {
    state: 'default',
    runtime,
    label: 'Browser · not asked yet — click Test notification',
  };
}

/** Request permission early (browser or Tauri). */
export async function requestNotifyPermission(): Promise<void> {
  if (isTauri()) {
    const ok = await ensureTauriPermission();
    await hookTauriActionOnce();
    // Also poke native permission command
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('plugin:notification|request_permission');
    } catch {
      /* desktop always grants */
    }
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
 * Show a system notification. Prefer native Tauri invoke; fall back to plugin API then Web.
 */
export async function showNotification(
  payload: MailNotifyPayload,
): Promise<NotifyResult> {
  const { title, body, threadId } = payload;
  console.info('[notify] show requested', title, body?.slice?.(0, 80));

  const cleanOptions: Record<string, unknown> = {
    title,
    body: body || ' ',
  };
  if (threadId) {
    cleanOptions['extra'] = { threadId };
  }

  if (isTauri()) {
    await hookTauriActionOnce();
    await ensureTauriPermission();

    // 1) App-owned command — osascript on macOS so `tauri dev` is not
    //    impersonating Terminal (plugin default), then plugin builder.
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('show_mail_notification', { title, body: body || ' ' });
      console.info('[notify] rust-osascript ok', title);
      return {
        ok: true,
        channel: 'tauri-native',
        detail: 'Sent as a macOS notification (Local Mail). Check Notification Center if banners are off.',
      };
    } catch (e) {
      console.warn('[notify] show_mail_notification failed', e);
    }

    // 2) Plugin notify command
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      try {
        await invoke('plugin:notification|request_permission');
      } catch {
        /* ignore */
      }
      await invoke('plugin:notification|notify', {
        options: { ...cleanOptions, sound: 'Ping' },
      });
      console.info('[notify] tauri-native ok', title);
      return {
        ok: true,
        channel: 'tauri-native',
        detail:
          'Sent via native plugin. If nothing appears: System Settings → Notifications → Script Editor / Local Mail (banners on).',
      };
    } catch (e) {
      console.warn('[notify] tauri-native failed', e);
    }

    // 2) Plugin helper (uses Notification polyfill → same command)
    try {
      const { sendNotification } = await import(
        '@tauri-apps/plugin-notification'
      );
      sendNotification({
        title,
        body: body || ' ',
        extra: threadId ? { threadId } : undefined,
      });
      console.info('[notify] tauri-api ok', title);
      return {
        ok: true,
        channel: 'tauri-api',
        detail: 'Sent via Tauri Notification API.',
      };
    } catch (e) {
      console.warn('[notify] tauri-api failed', e);
    }
  }

  if (showWebNotification(payload)) {
    return {
      ok: true,
      channel: 'web',
      detail: 'Sent via browser Notification API.',
    };
  }

  return {
    ok: false,
    channel: 'none',
    detail:
      'All channels failed. Use the desktop app (not only the browser), allow notifications in System Settings, and turn off Focus mode.',
  };
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
