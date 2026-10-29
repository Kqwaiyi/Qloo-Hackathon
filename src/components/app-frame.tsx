import type { ReactNode } from "react";

import { onest } from "@/fonts/onest";

/**
 * The frame of the app's own pages, the signed-in app's and the Guest Page alike: a white header
 * bar holding `header`, any `banner` under it, and the page. A page with a data-fit-screen part
 * (each New Consultation step) is exactly the screen's height, never shorter than 34rem: the
 * header and banner take what they need, and the page the rest, to fit its step into without the
 * window scrolling.
 */
export function AppFrame({ header, banner, children }: { header: ReactNode; banner?: ReactNode; children: ReactNode }) {
  return (
    <div
      className={`min-h-screen ${onest.className} has-[[data-fit-screen]]:flex has-[[data-fit-screen]]:h-dvh has-[[data-fit-screen]]:min-h-[34rem] has-[[data-fit-screen]]:flex-col`}
    >
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">{header}</div>
      </header>
      {banner}
      <main className="mx-auto max-w-3xl px-4 py-8 has-[[data-fit-screen]]:flex has-[[data-fit-screen]]:min-h-0 has-[[data-fit-screen]]:w-full has-[[data-fit-screen]]:flex-1 has-[[data-fit-screen]]:flex-col has-[[data-fit-screen]]:pt-5 has-[[data-fit-screen]]:pb-4 sm:has-[[data-fit-screen]]:pt-7 sm:has-[[data-fit-screen]]:pb-6">
        {children}
      </main>
    </div>
  );
}
