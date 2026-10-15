/** The current time, injected so tests can set it. */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
