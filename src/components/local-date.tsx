"use client";

import { useSyncExternalStore } from "react";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
// The app is in English: one locale keeps the server's and the browser's text alike.
const LOCALE = "en-GB";

const subscribe = () => () => {};

/** A date in the viewer's own time zone. The server, which doesn't know it, renders it in UTC. */
export function LocalDate({ date }: { date: Date }) {
  const text = date.toLocaleDateString(LOCALE, useInViewersTimeZone(DATE_FORMAT));
  return <time dateTime={date.toISOString()}>{text}</time>;
}

/**
 * A time of day in the viewer's own time zone, such as "09:00" or "14:30", for a sentence. The
 * server, which doesn't know it, renders it in UTC.
 */
export function useLocalTime(date: Date): string {
  return date.toLocaleTimeString(LOCALE, useInViewersTimeZone(TIME_FORMAT));
}

/** The format set to the viewer's own time zone in the browser, and to UTC on the server. */
function useInViewersTimeZone(format: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  const inBrowser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return inBrowser ? format : { ...format, timeZone: "UTC" };
}
