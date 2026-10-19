import type { ReactNode } from "react";

import { onest } from "@/fonts/onest";

import "./landing.css";

// The landing page's own layout: its one typeface, Onest, and its stylesheet, both scoped to the
// `.landing` root so the app's pages keep their look after a visitor moves on to them.

export default function LandingLayout({ children }: { children: ReactNode }) {
  return <div className={`landing ${onest.variable}`}>{children}</div>;
}
