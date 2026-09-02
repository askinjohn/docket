/**
 * Open a URL in the system browser (Tauri) or a new tab (web).
 * Never navigate the app shell for OAuth — password managers need a real browser.
 */
export async function openExternalUrl(url: string): Promise<void> {
  // Tauri 2 desktop shell
  if (isTauri()) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(url);
      return;
    } catch (e) {
      console.warn('[openExternal] Tauri opener failed, falling back', e);
    }
  }

  // Browser / fallback: new tab keeps Docket UI alive
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    // Popup blocked — last resort (user can still complete flow)
    window.location.assign(url);
  }
}

function isTauri(): boolean {
  const w = window as unknown as {
    __TAURI_INTERNALS__?: unknown;
    __TAURI__?: unknown;
    isTauri?: boolean;
  };
  return Boolean(w.__TAURI_INTERNALS__ || w.__TAURI__ || w.isTauri);
}
