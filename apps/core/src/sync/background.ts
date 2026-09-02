import { isAccountAuthExpired, getActiveAccount } from '../db/accounts.js';
import { publish } from '../events/bus.js';
import { isGmailAuthExpired } from '../gmail/auth-errors.js';
import { syncIncremental } from '../gmail/sync.js';
import { notifyOsMail } from '../notify/os.js';
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
    // History-only: a full fallback after restart would re-notify old mail.
    if (result.mode === 'history' && result.newMail.length) {
      const batch = result.newMail.slice(0, 3);
      if (result.newMail.length === 1) {
        const m = batch[0]!;
        notifyOsMail(m.from, m.subject);
      } else {
        notifyOsMail(
          `${result.newMail.length} new messages`,
          batch.map((m) => `${m.from}: ${m.subject}`).join(' · '),
        );
      }
    }
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
    `[bg-sync] every ${Math.round(ms / 1000)}s · os notify ${appConfig.osNotify ? 'on' : 'off'}`,
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
