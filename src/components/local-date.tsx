"use client";

import { useSyncExternalStore } from "react";

const FORMAT: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
// The app is in English: one locale keeps the server's and the browser's text alike.
const LOCALE = "en-GB";

const subscribe = () => () => {};

/** A date in the viewer's own time zone. The server, which doesn't know it, renders it in UTC. */
export function LocalDate({ date }: { date: Date }) {
  const inBrowser = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const text = date.toLocaleDateString(LOCALE, inBrowser ? FORMAT : { ...FORMAT, timeZone: "UTC" });
  return <time dateTime={date.toISOString()}>{text}</time>;
}
