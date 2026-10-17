"use client";

import { useState, useTransition } from "react";

/**
 * A request from the results page that starts a Styling, such as "Show 2 more Outfits": `sending`
 * while it's on its way, and `failed` when the request itself failed (the network, or our side)
 * rather than the Styling, until the next `send` or `clearFailed`. The page refreshes to show what
 * came of it.
 */
export function useStylingRequest(): {
  sending: boolean;
  failed: boolean;
  send: (request: () => Promise<void>) => void;
  clearFailed: () => void;
} {
  const [sending, startSending] = useTransition();
  const [failed, setFailed] = useState(false);

  function send(request: () => Promise<void>) {
    setFailed(false);
    startSending(async () => {
      try {
        await request();
      } catch {
        setFailed(true);
      }
    });
  }

  return { sending, failed, send, clearFailed: () => setFailed(false) };
}
