"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

/** Cloudflare Turnstile's script, which renders its widget only when told to. */
const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/** The part of Turnstile's browser API the Bot Check uses. */
interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let turnstileLoading: Promise<Turnstile> | undefined;

/** Loads Turnstile's script once per page, however many forms ask for it. */
function loadTurnstile(): Promise<Turnstile> {
  turnstileLoading ??= new Promise<Turnstile>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile didn't start.")));
    script.onerror = () => reject(new Error("Turnstile's script didn't load."));
    document.head.append(script);
  }).catch((error: unknown) => {
    // A later form tries again.
    turnstileLoading = undefined;
    throw error;
  });
  return turnstileLoading;
}

export interface BotCheck {
  /**
   * Sends the form with the widget's token, as `sendForm` does it, and gives back its answer. The
   * token is undefined while the Bot Check is off, and "" if the widget failed, which the server
   * refuses with a message to try again. A form sent before the widget has a token, or while
   * Cloudflare wants a click, waits for one. Cloudflare takes each token once, so whatever the
   * answer, the widget then gets a new one for the next try.
   */
  send<T>(sendForm: (botCheckToken: string | undefined) => Promise<T>): Promise<T>;
  /** Where the widget goes in the form. Most visitors never see it. */
  widget: ReactNode;
}

/**
 * The Bot Check's Turnstile widget, given the site key, or nothing while the Bot Check is off. It
 * shows itself only when Cloudflare needs the visitor to click, in the browser's language, and
 * renews an expired token on its own.
 */
export function useBotCheck(siteKey: string | null): BotCheck {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  // The newest token, "" while there's none, and whether the widget has given up.
  const current = useRef({ token: "", failed: false });
  const waiting = useRef<((token: string) => void)[]>([]);
  // Bumped to load Turnstile's script again after it didn't load.
  const [loadAttempt, setLoadAttempt] = useState(0);

  const settle = useCallback((token: string, failed: boolean) => {
    current.current = { token, failed };
    if (!token && !failed) return;
    for (const resolve of waiting.current.splice(0)) resolve(token);
  }, []);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;
    loadTurnstile().then(
      (turnstile) => {
        if (cancelled || !container.current) return;
        widgetId.current = turnstile.render(container.current, {
          sitekey: siteKey,
          appearance: "interaction-only",
          "refresh-expired": "auto",
          callback: (newToken: string) => settle(newToken, false),
          // Renewed on its own, so a form sent meanwhile waits for the new one.
          "expired-callback": () => settle("", false),
          "error-callback": () => settle("", true),
        });
      },
      // No widget: the form goes without a token, and the server says to try again.
      () => settle("", true),
    );
    return () => {
      cancelled = true;
      if (widgetId.current !== undefined) window.turnstile?.remove(widgetId.current);
      widgetId.current = undefined;
    };
  }, [siteKey, settle, loadAttempt]);

  const token = useCallback(async () => {
    if (!siteKey) return undefined;
    const { token: newest, failed } = current.current;
    if (newest || failed) return newest;
    return new Promise<string>((resolve) => waiting.current.push(resolve));
  }, [siteKey]);

  const reset = useCallback(() => {
    const { failed } = current.current;
    current.current = { token: "", failed: false };
    if (widgetId.current !== undefined) window.turnstile?.reset(widgetId.current);
    // No widget to make the next token, so the next try would wait forever: load the script again.
    else if (failed) setLoadAttempt((attempt) => attempt + 1);
  }, []);

  const send = useCallback(
    async function send<T>(sendForm: (botCheckToken: string | undefined) => Promise<T>): Promise<T> {
      try {
        return await sendForm(await token());
      } finally {
        reset();
      }
    },
    [token, reset],
  );

  return { send, widget: siteKey ? <div ref={container} /> : null };
}
