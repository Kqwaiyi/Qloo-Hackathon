/**
 * The CRON_SECRET the smoke tests' dev server runs with, so they can run the daily sweep as Vercel
 * Cron does. Kept apart from the tests' support code, which the Playwright config needn't load.
 */
export const SMOKE_CRON_SECRET = "smoke-test-cron-secret-not-for-deployed-environments";
