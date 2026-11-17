import { Deferred, Effect } from "effect";

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

export function makeInFlight(): InFlight {
  const active = new Set<() => void>();
  let waiters: Array<Deferred.Deferred<void>> = [];

  const notifyIfIdle = () => {
    if (active.size > 0) return;
    const ready = waiters;
    waiters = [];
    for (const waiter of ready) Deferred.doneUnsafe(waiter, Effect.void);
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

  const awaitIdle = Effect.suspend(() =>
    active.size === 0
      ? Effect.void
      : Effect.flatMap(Deferred.make<void>(), (waiter) =>
          Effect.suspend(() => {
            if (active.size === 0) return Effect.void;
            waiters.push(waiter);
            return Deferred.await(waiter);
          })
        )
  );

  return { enter, releaseAll, awaitIdle, count: () => active.size };
}
