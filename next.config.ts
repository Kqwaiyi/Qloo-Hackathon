import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

// The Bot Check's keys, checked as the app checks them when it starts (botCheckFromEnvironment). Its
// services start at the first request, not at build, so without this a Production deploy missing
// the secret would build and then fail every request. A failed build leaves the last deploy live.
if (process.env.VERCEL_ENV === "production" && !process.env.TURNSTILE_SECRET_KEY) {
  throw new Error("TURNSTILE_SECRET_KEY is not set.");
}
if (process.env.TURNSTILE_SECRET_KEY && !process.env.TURNSTILE_SITE_KEY) {
  throw new Error("TURNSTILE_SITE_KEY must be set with TURNSTILE_SECRET_KEY.");
}

const nextConfig: NextConfig = {
  // PGlite (the local development database) loads its WebAssembly from its own package files.
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    serverActions: {
      // "Get my Outfits" sends the photo. Start a Consultation refuses anything over 2 MB itself;
      // this leaves room above that for the form's own bytes.
      bodySizeLimit: "3mb",
    },
  },
};

// Turns on Vercel Workflow's "use workflow" and "use step" directives, for Stylings.
export default withWorkflow(nextConfig);
