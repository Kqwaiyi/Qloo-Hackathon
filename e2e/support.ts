import { expect, type Page } from "@playwright/test";
import sharp from "sharp";

export const SMOKE_PASSWORD = "smoke-test-password";

let signUps = 0;

/** Signs up a new adult user through both steps, landing on New Consultation. Returns their username. */
export async function signUpNewUser(page: Page): Promise<{ username: string }> {
  signUps += 1;
  const id = `${Date.now().toString(36)}${signUps}`;
  const username = `Smoke.${id}`;

  await page.goto("/sign-up");
  await page.getByLabel("Day").fill("17");
  await page.getByLabel("Month").selectOption("5");
  await page.getByLabel("Year").fill("1990");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(`smoke.${id}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(SMOKE_PASSWORD);
  await page.getByRole("radio", { name: "Womenswear" }).check();
  await page.getByLabel("Country").selectOption("GB");
  await page.getByRole("checkbox", { name: /I agree to the Terms/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/consultations\/new$/);
  return { username };
}

/** A plain JPEG the browser can open. */
export async function plainPhoto(): Promise<Buffer> {
  return sharp({ create: { width: 300, height: 400, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
}
