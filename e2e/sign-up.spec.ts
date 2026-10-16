import { expect, test } from "@playwright/test";

import { SMOKE_PASSWORD, signUpNewUser } from "./support";

test("a visitor signs up through both steps, lands in the app, and can sign back in", async ({ page }) => {
  const { username } = await signUpNewUser(page);

  await expect(page.getByRole("heading", { name: "New Consultation" })).toBeVisible();
  await page.getByRole("link", { name: "My Consultations" }).click();
  await expect(page.getByRole("heading", { name: "My Consultations" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/sign-in");
  await page.getByLabel("Username or email").fill(username.toLowerCase());
  await page.getByLabel("Password", { exact: true }).fill(SMOKE_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/consultations\/new$/);
});

test("someone under 18 is stopped at step 1, and stays stopped", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Day").fill("1");
  await page.getByLabel("Month").selectOption("1");
  await page.getByLabel("Year").fill("2012");
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("You need to be 18 or older to use Outfit Recommender.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("You need to be 18 or older to use Outfit Recommender.")).toBeVisible();
  await expect(page.getByLabel("Day")).toHaveCount(0);
});
