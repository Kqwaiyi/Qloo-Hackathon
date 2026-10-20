import localFont from "next/font/local";

// Qurator's one typeface, Onest, on the landing page and the signed-in app alike. It's self-hosted
// from this folder (SIL Open Font License, see OFL.txt), so builds never depend on reaching Google
// Fonts.

export const onest = localFont({
  src: "./onest-latin-variable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-onest",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});
