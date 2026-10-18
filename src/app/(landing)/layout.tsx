import localFont from "next/font/local";
import type { ReactNode } from "react";

import "./landing.css";

// The landing page's own layout: its one typeface, Onest, and its stylesheet, both scoped to the
// `.landing` root so the app's pages keep their look after a visitor moves on to them. Onest is
// self-hosted from ./fonts (SIL Open Font License, see OFL.txt), so builds never depend on
// reaching Google Fonts.

const onest = localFont({
  src: "./fonts/onest-latin-variable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-onest",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export default function LandingLayout({ children }: { children: ReactNode }) {
  return <div className={`landing ${onest.variable}`}>{children}</div>;
}
