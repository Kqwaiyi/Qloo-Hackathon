import { expect, test } from "@playwright/test";

import { openEmailedLink, SMOKE_PASSWORD, signUpNewUser } from "./support";

test("a visitor signs up through both steps, verifies by the emailed link, and can sign back in", async ({ page }) => {
  const { username, email } = await signUpNewUser(page);

  await expect(page.getByRole("heading", { name: "New Consultation" })).toBeVisible();
  const banner = page.getByRole("region", { name: "Verify your email", exact: true });
  await expect(banner).toContainText(`We sent a link to ${email}. Verify it to start your first Consultation.`);
  await expect(page.getByRole("heading", { name: "Verify your email first" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Full-Body Photo/ })).toHaveCount(0);

  await openEmailedLink(page, email);

  await expect(page).toHaveURL(/\/consultations\/new\?email-verified=1$/);
  await expect(page.getByText("Email verified")).toBeVisible();
  await expect(banner).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /Full-Body Photo/ })).toBeChecked();
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

  await expect(page.getByText("You need to be 18 or older to use Qurator.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("You need to be 18 or older to use Qurator.")).toBeVisible();
  await expect(page.getByLabel("Day")).toHaveCount(0);
});
