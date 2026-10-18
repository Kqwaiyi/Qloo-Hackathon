import Link from "next/link";

import { COPY } from "@/config/copy";
import { APP_HOME, ROUTES } from "@/config/routes";

import { Label, Pill } from "../ui";

// What frames every chapter: the fixed ground behind them, the header, the chapter indicator and
// the first-visit loader.

/** Where "Get started" goes: the call to action, which says where photos go before anyone signs up. */
export const GET_STARTED_ID = "get-started";

/** The fixed colour behind the transparent chapters, which the motion layer moves between paper and ink. */
export function Ground() {
  return <div data-ground-layer aria-hidden="true" className="landing-ground" />;
}

/** The rules that show the loader, rise its wordmark and fill its hairline. Its keyframes are in landing.css. */
const LOADER_STYLE = [
  ".landing-loader{display:flex;animation:landing-loader-fallback .6s var(--ease-curtain) 3s forwards}",
  ".landing-loader [data-loader-word]{animation:landing-loader-rise .9s var(--ease-glide) both}",
  ".landing-loader span:nth-child(2)>[data-loader-word]{animation-delay:.08s}",
  ".landing-loader [data-loader-bar]{animation:landing-loader-bar 1s var(--ease-sweep) both}",
].join("");

/**
 * Turns the loader on before the first paint, once per browser session, and never for someone who
 * asked for reduced motion. It's inline so it runs before the page is drawn, and it adds a <style>
 * to the head rather than touching any element React renders, so hydration finds nothing changed.
 */
const LOADER_SCRIPT = `try{if(!sessionStorage.getItem("landing-loader")&&!matchMedia("(prefers-reduced-motion: reduce)").matches){var s=document.createElement("style");s.setAttribute("data-landing-loader","");s.textContent=${JSON.stringify(LOADER_STYLE)};document.head.appendChild(s);sessionStorage.setItem("landing-loader","1")}}catch(e){}`;

/** The wordmark spread across the screen while a hairline fills, for about a second on the first visit. */
export function Loader() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: LOADER_SCRIPT }} />
      <div data-loader aria-hidden="true" className="landing-loader fixed inset-0 z-[100] flex-col justify-center bg-paper text-ink">
        <span data-loader-bar className="absolute top-0 left-0 h-px w-full origin-left bg-ink" />
        <p className="flex flex-col px-4 text-display uppercase md:px-6 xl:flex-row xl:justify-between">
          <span className="block overflow-hidden">
            <span data-loader-word className="block">
              Outfit
            </span>
          </span>
          <span className="block self-end overflow-hidden xl:self-auto">
            <span data-loader-word className="block">
              Recommender
            </span>
          </span>
        </p>
      </div>
    </>
  );
}

/** The wordmark on the left; on the right, signing in (or opening the app) and getting started. */
export function Header({ signedIn }: { signedIn: boolean }) {
  return (
    <header data-header className="landing-header fixed inset-x-0 top-0 z-50 flex items-center justify-between gap-3 px-4 py-4 md:px-6 md:py-5">
      <Link href={ROUTES.home} className="inline-flex h-10 items-center rounded-full bg-ink/70 px-4 text-paper ring-1 ring-paper/12 backdrop-blur-md">
        <Label className="whitespace-nowrap">Outfit Recommender</Label>
      </Link>
      <nav aria-label="Account" className="flex items-center gap-2">
        <Pill href={signedIn ? APP_HOME : ROUTES.signIn} variant="glass" className="pr-4">
          {signedIn ? "Open the app" : "Sign in"}
        </Pill>
        <Pill href={`#${GET_STARTED_ID}`} variant="solid" tone="ink" glyph="+" data-scroll-to="" className="ring-1 ring-ink/10 max-sm:hidden">
          Get started
        </Pill>
      </nav>
    </header>
  );
}

/** Which numbered chapter the reader is in, top centre, set by the motion layer. */
export function ChapterIndicator() {
  return (
    <p
      data-chapter-indicator
      aria-hidden="true"
      className="pointer-events-none fixed top-7 left-1/2 z-40 hidden -translate-x-1/2 text-paper opacity-0 mix-blend-difference lg:block"
    >
      <span data-chapter-indicator-text className="text-label font-medium uppercase" />
    </p>
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
