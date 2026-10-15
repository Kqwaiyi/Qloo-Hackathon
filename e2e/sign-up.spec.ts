import { expect, test } from "@playwright/test";

test("a visitor signs up through both steps, lands in the app, and can sign back in", async ({ page }) => {
  const id = Date.now().toString(36);

  await page.goto("/sign-up");
  await page.getByLabel("Day").fill("17");
  await page.getByLabel("Month").selectOption("5");
  await page.getByLabel("Year").fill("1990");
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByLabel("Username").fill(`Smoke.${id}`);
  await page.getByLabel("Email").fill(`smoke.${id}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("smoke-test-password");
  await page.getByRole("radio", { name: "Womenswear" }).check();
  await page.getByLabel("Country").selectOption("GB");
  await page.getByRole("checkbox", { name: /I agree to the Terms/ }).check();
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL(/\/consultations\/new$/);
  await expect(page.getByRole("heading", { name: "New Consultation" })).toBeVisible();
  await page.getByRole("link", { name: "My Consultations" }).click();
  await expect(page.getByRole("heading", { name: "My Consultations" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/sign-in");
  await page.getByLabel("Username or email").fill(`smoke.${id}`);
  await page.getByLabel("Password", { exact: true }).fill("smoke-test-password");
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
