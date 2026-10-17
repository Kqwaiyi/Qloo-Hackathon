"use client";

import { useSyncExternalStore } from "react";

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
// The app is in English: one locale keeps the server's and the browser's text alike.
const LOCALE = "en-GB";

const subscribe = () => () => {};

/** A date in the viewer's own time zone. The server, which doesn't know it, renders it in UTC. */
export function LocalDate({ date }: { date: Date }) {
  return <time dateTime={date.toISOString()}>{useLocalFormatters().date(date)}</time>;
}

/**
 * Writes dates and times in the viewer's own time zone, for a sentence: a date such as
 * "1 November 2026", or a time of day such as "09:00" or "14:30". The server, which doesn't know
 * the time zone, writes them in UTC.
 */
export function useLocalFormatters(): { date: (date: Date) => string; time: (date: Date) => string } {
  const inBrowser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const timeZone = inBrowser ? undefined : "UTC";
  return {
    date: (date) => date.toLocaleDateString(LOCALE, { ...DATE_FORMAT, timeZone }),
    time: (date) => date.toLocaleTimeString(LOCALE, { ...TIME_FORMAT, timeZone }),
  };
}
