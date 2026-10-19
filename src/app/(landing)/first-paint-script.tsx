"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/**
 * An inline script that runs from the server's HTML, before the first paint. React can't run a
 * script it creates in the browser, and warns when asked to, so this renders it only while the
 * server's HTML is being hydrated, and nothing on a client-side visit or after hydration (by
 * then it has already run).
 */
export function FirstPaintScript({ code }: { code: string }) {
  const fromServer = useSyncExternalStore(subscribe, () => false, () => true);
  return fromServer ? <script dangerouslySetInnerHTML={{ __html: code }} /> : null;
}
