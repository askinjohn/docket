import { spawn } from 'node:child_process';

import { appConfig } from '../config.js';

function appleEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Fire a macOS notification from core (works with no UI open). */
export function notifyOsMail(title: string, body: string): void {
  if (!appConfig.osNotify) return;
  if (process.platform !== 'darwin') return;

  const t = appleEscape((title || 'Docket').slice(0, 80));
  const b = appleEscape((body || 'New mail').slice(0, 160));
  const script = `display notification "${b}" with title "${t}" subtitle "Docket" sound name "New Mail"`;

  try {
    const child = spawn('osascript', ['-e', script], {
      stdio: 'ignore',
      detached: true,
    });
    child.unref();
  } catch (e) {
    console.warn('[notify] osascript failed', e);
  }
}
