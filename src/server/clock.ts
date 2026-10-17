/** The current time, injected so tests can set it. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Midnight UTC on the first day of `at`'s UTC calendar month. */
export function startOfUtcMonth(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

/** Midnight UTC on the first day of the UTC calendar month after `at`'s. */
export function startOfNextUtcMonth(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
}
