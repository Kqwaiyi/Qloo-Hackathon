import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

// Browser smoke tests against local development: a fresh in-memory database per run.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  // One dev server compiles each page on its first visit: spec files run side by side make those
  // compiles race and time out.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    // Set PLAYWRIGHT_CHANNEL=chrome to use an installed Chrome instead of Playwright's own Chromium.
    channel: process.env.PLAYWRIGHT_CHANNEL,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      PGLITE_DATA_DIR: "memory://",
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      // Turnstile's always-pass test keys, so sign-up goes through the real widget and Cloudflare's
      // verify call. Both need internet access.
      TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    },
  },
});
