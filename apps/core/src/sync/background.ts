import { isAccountAuthExpired, getActiveAccount } from '../db/accounts.js';
import { publish } from '../events/bus.js';
import { isGmailAuthExpired } from '../gmail/auth-errors.js';
import { syncIncremental } from '../gmail/sync.js';
import { appConfig } from '../config.js';

let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

async function tick(): Promise<void> {
  if (inFlight) return;
  const account = getActiveAccount();
  if (!account || isAccountAuthExpired(account)) return;

  inFlight = true;
  try {
    const result = await syncIncremental({ maxThreads: 40 });
    publish({
      type: 'mail.synced',
      synced: result.synced,
      at: new Date().toISOString(),
    });
    // New mail is published as mail.new for the UI. No OS banner here —
    // notifications only while the Docket window is in front.
  } catch (e) {
    if (isGmailAuthExpired(e)) {
      console.warn('[bg-sync] auth expired — pausing until sign-in');
    } else {
      console.warn('[bg-sync] tick failed', e instanceof Error ? e.message : e);
    }
  } finally {
    inFlight = false;
  }
}

export function startBackgroundSync(): void {
  stopBackgroundSync();
  const ms = appConfig.bgSyncIntervalMs;
  if (ms <= 0) {
    console.log('[bg-sync] disabled (DOCKET_BG_SYNC_MS=0)');
    return;
  }
  console.log(
    `[bg-sync] every ${Math.round(ms / 1000)}s · new-mail OS notify off (in-app only)`,
  );
  timer = setInterval(() => {
    void tick();
  }, ms);
}

export function stopBackgroundSync(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
