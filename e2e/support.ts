import { type APIRequestContext, expect, type Page } from "@playwright/test";
import sharp from "sharp";

import { LOCAL_INBOX_FOLDER, readInbox } from "../src/server/email/inbox";
import { SMOKE_CRON_SECRET } from "./cron-secret";

export const SMOKE_PASSWORD = "smoke-test-password";

/**
 * Runs the daily sweep as Vercel Cron does, which stores the day's exchange rates from their live
 * sources: a Styling outside the US needs them to hold its searches to each Brand's price range.
 */
export async function runDailySweep(request: APIRequestContext): Promise<void> {
  const response = await request.get("/api/daily-sweep", { headers: { authorization: `Bearer ${SMOKE_CRON_SECRET}` } });
  expect(await response.json()).toMatchObject({ exchangeRatesFrom: expect.any(String) });
}

let signUps = 0;

/** Signs up a new adult user through both steps, landing on New Consultation unverified. */
export async function signUpNewUser(page: Page): Promise<{ username: string; email: string }> {
  signUps += 1;
  const id = `${Date.now().toString(36)}${signUps}`;
  const username = `Smoke.${id}`;
  const email = `smoke.${id}@example.com`;

  await page.goto("/sign-up");
  await page.getByLabel("Day").fill("17");
  await page.getByLabel("Month").selectOption("5");
  await page.getByLabel("Year").fill("1990");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(SMOKE_PASSWORD);
  await page.getByRole("radio", { name: "Womenswear" }).check();
  await page.getByLabel("Country").selectOption("GB");
  await page.getByRole("checkbox", { name: /I agree to the Terms/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();

  // In development, a run's first sign-up starts the database and compiles the page it lands on.
  await expect(page).toHaveURL(/\/consultations\/new$/, { timeout: 15_000 });
  return { username, email };
}

/** Opens the newest link emailed to this address, from local development's capturing inbox. */
export async function openEmailedLink(page: Page, email: string): Promise<void> {
  let link: string | undefined;
  await expect
    .poll(async () => {
      const newest = (await readInbox(LOCAL_INBOX_FOLDER, email)).at(-1);
      link = newest && /https?:\/\/\S+/.exec(newest.text)?.[0];
      return link;
    })
    .toBeDefined();
  await page.goto(link!);
}

/** Signs up a new adult user and verifies their email by its link, landing on New Consultation. */
export async function signUpVerifiedUser(page: Page): Promise<{ username: string; email: string }> {
  const user = await signUpNewUser(page);
  await openEmailedLink(page, user.email);
  await expect(page.getByText("Email verified")).toBeVisible();
  return user;
}

/** The consent sheet "Get my Outfits" opens before a user's first Consultation. */
export function consentSheet(page: Page) {
  return page.getByRole("dialog", { name: "Before we use your photos" });
}

/** Ticks both of the consent sheet's boxes and continues, which sends the photo. */
export async function agreeOnConsentSheet(page: Page): Promise<void> {
  const sheet = consentSheet(page);
  await sheet.getByRole("checkbox", { name: /storing my photos/ }).check();
  await sheet.getByRole("checkbox", { name: /Google's Gemini/ }).check();
  await sheet.getByRole("button", { name: "Continue" }).click();
}

/** A plain JPEG the browser can open. */
export async function plainPhoto(): Promise<Buffer> {
  return sharp({ create: { width: 300, height: 400, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
}
