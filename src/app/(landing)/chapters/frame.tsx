import Link from "next/link";

import { WORDMARK_SIZE, WORDMARK_SRC } from "@/components/wordmark";
import { COPY } from "@/config/copy";
import { APP_HOME, ROUTES } from "@/config/routes";

import { FirstPaintScript } from "../first-paint-script";
import { Label, Pill } from "../ui";

// What frames every chapter: the fixed ground behind them, the header and the first-visit loader.

/** The closing chapter: the call to action, which says where photos go before anyone signs up. */
export const GET_STARTED_ID = "get-started";

/** The fixed colour behind the transparent chapters, which the motion layer moves between paper and ink. */
export function Ground() {
  return <div data-ground-layer aria-hidden="true" className="landing-ground" />;
}

/** The rules that show the loader, rise its wordmark and fill its hairline. Its keyframes are in landing.css. */
const LOADER_STYLE = [
  ".landing-loader{display:flex;animation:landing-loader-fallback .6s var(--ease-curtain) 3s forwards}",
  ".landing-loader [data-loader-word]{animation:landing-loader-rise .9s var(--ease-glide) both}",
  ".landing-loader [data-loader-bar]{animation:landing-loader-bar 1s var(--ease-sweep) both}",
].join("");

/**
 * Turns the loader on before the first paint, once per browser session, and never for someone who
 * asked for reduced motion. It's inline so it runs before the page is drawn, and it adds a <style>
 * to the head rather than touching any element React renders, so hydration finds nothing changed.
 * A client-side visit never runs it, so it never shows the loader.
 */
const LOADER_SCRIPT = `try{if(!sessionStorage.getItem("landing-loader")&&!matchMedia("(prefers-reduced-motion: reduce)").matches){var s=document.createElement("style");s.setAttribute("data-landing-loader","");s.textContent=${JSON.stringify(LOADER_STYLE)};document.head.appendChild(s);sessionStorage.setItem("landing-loader","1")}}catch(e){}`;

/** The wordmark, centred, while a hairline fills, for about a second on the first visit. */
export function Loader() {
  return (
    <>
      <FirstPaintScript code={LOADER_SCRIPT} />
      <div data-loader aria-hidden="true" className="landing-loader fixed inset-0 z-[100] flex-col justify-center bg-paper text-ink">
        <span data-loader-bar className="absolute top-0 left-0 h-px w-full origin-left bg-ink" />
        {/* Sized in display type: 1.15em puts its caps at the display size's cap height. */}
        <div className="flex justify-center px-4 text-display md:px-6">
          <span className="block overflow-hidden">
            <img data-loader-word src={WORDMARK_SRC.paper} alt="" {...WORDMARK_SIZE} fetchPriority="high" className="block h-[1.15em] w-auto" />
          </span>
        </div>
      </div>
    </>
  );
}

/**
 * The wordmark on the left; on the right, signing in (or opening the app) and, for a signed-out
 * visitor, trying the app as a Guest, on every screen width.
 * Each side is fixed on its own: the wordmark has no backing, and inverts against whatever passes
 * under it (landing.css), which it couldn't do from inside a fixed bar.
 */
export function Header({ signedIn }: { signedIn: boolean }) {
  return (
    <header>
      {/* Boxed like the nav (40 px inside the same padding), so the two slide away together and
          the wordmark leaves the screen as fully. 12 px down, its caps centre on the pills. */}
      <Link href={ROUTES.home} data-header className="landing-header landing-wordmark fixed top-0 left-0 z-50 px-4 py-4 text-paper md:px-6 md:py-5">
        <img src={WORDMARK_SRC.ink} alt="Qurator" {...WORDMARK_SIZE} className="mt-3 mb-1 block h-6 w-auto max-[374px]:h-5 max-[339px]:h-[18px]" />
      </Link>
      <nav aria-label="Account" data-header className="landing-header fixed top-0 right-0 z-50 flex items-center gap-1.5 px-4 py-4 max-[374px]:gap-1 max-[374px]:pr-3 sm:gap-2 md:px-6 md:py-5">
        <Pill href={signedIn ? APP_HOME : ROUTES.signIn} variant="glass" compactOnPhones className="pr-4">
          {signedIn ? "Open the app" : "Sign in"}
        </Pill>
        {!signedIn && (
          <Pill href={ROUTES.guest} variant="solid" tone="ink" glyph="+" compactOnPhones className="ring-1 ring-ink/10">
            {COPY.tryItAsAGuest}
          </Pill>
        )}
      </nav>
    </header>
  );
}

/** Shown once an account is deleted, when the app sends its owner here. */
export function AccountDeletedNotice() {
  return (
    <p role="status" className="absolute top-20 left-1/2 z-20 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-paper md:top-24">
      <Label>{COPY.accountDeleted}</Label>
    </p>
  );
}
