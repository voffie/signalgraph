import { Effect } from "effect";

/**
 * Counts messages that have been accepted from the broker but not yet settled
 * (acked, retried, dead-lettered or returned). Adapters call `enter` when a
 * message is received and the returned function when it is settled.
 */
export interface InFlight {
  /** Synchronous, so it is safe to call from callbacks. Returns an idempotent release. */
  readonly enter: () => () => void;
  /** Releases everything still outstanding. For use after the broker has taken the messages back. */
  readonly releaseAll: () => void;
  readonly awaitIdle: Effect.Effect<void>;
  readonly count: () => number;
}

/** Creates one delivery settlement tracker for a broker instance. */
export function trackBrokerDeliveries(): InFlight {
  const active = new Set<() => void>();
  const waiters = new Set<() => void>();

  const notifyIfIdle = () => {
    if (active.size > 0) return;

    const ready = [...waiters];
    waiters.clear();

    for (const waiter of ready) waiter();
  };

  const enter = () => {
    const release = () => {
      if (active.delete(release)) notifyIfIdle();
    };

    active.add(release);

    return release;
  };

  const releaseAll = () => {
    for (const release of [...active]) release();
  };

  const awaitIdle = Effect.callback<void>((resume) => {
    if (active.size === 0) return resume(Effect.void);

    const notify = () => resume(Effect.void);
    waiters.add(notify);

    return Effect.sync(() => void waiters.delete(notify));
  });

  return { enter, releaseAll, awaitIdle, count: () => active.size };
}
