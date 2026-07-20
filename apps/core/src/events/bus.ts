type Listener = (event: LiveEvent) => void;

export type LiveEvent =
  | { type: 'mail.synced'; synced: number; at: string }
  | { type: 'mail.changed'; reason: string; at: string }
  /** A newly arrived message (history sync) — for Notification Center. */
  | {
      type: 'mail.new';
      threadId: string;
      messageId: string;
      from: string;
      subject: string;
      snippet: string;
      at: string;
    }
  | { type: 'heartbeat'; at: string };

const listeners = new Set<Listener>();

export function publish(event: LiveEvent): void {
  for (const l of listeners) {
    try {
      l(event);
    } catch (e) {
      console.error('[events] listener error', e);
    }
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
