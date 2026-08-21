import { subscribe } from '../events/bus.js';
import { cronDue } from './cron.js';
import { enqueueWorkflow } from './queue.js';
import { enabledWorkflows } from './store.js';

let timer: ReturnType<typeof setInterval> | null = null;
let unsub: (() => void) | null = null;

function onNewMail(threadId: string): void {
  for (const wf of enabledWorkflows('mail.received')) {
    enqueueWorkflow(wf, { reason: 'mail.received', threadId });
  }
}

function cronTick(): void {
  const now = new Date();
  for (const wf of enabledWorkflows('cron')) {
    const expr = wf.trigger.expr;
    if (!expr) continue;
    if (!cronDue(expr, wf.lastRunAt, now)) continue;
    enqueueWorkflow(wf, { reason: 'cron', limit: 120 });
  }
}

export function startWorkflows(): void {
  stopWorkflows();
  unsub = subscribe((ev) => {
    if (ev.type === 'mail.new') onNewMail(ev.threadId);
  });
  timer = setInterval(cronTick, 30_000);
  setTimeout(cronTick, 4_000);
  console.log('[workflow] engine on · mail.received + cron (30s)');
}

export function stopWorkflows(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (unsub) {
    unsub();
    unsub = null;
  }
}
