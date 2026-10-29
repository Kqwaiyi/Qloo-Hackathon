import { expect, test } from "@playwright/test";

import { consentSheet, plainPhoto } from "./support";

test("a visitor tries Qurator as a Guest from the landing page, and one Guest Consultation shows its two Outfits", async ({ page }) => {
  // Its Style Icons come from live Qloo, and in development each page compiles on its first visit.
  test.setTimeout(120_000);
  await page.goto("/");
  const tryAsGuest = page.getByRole("link", { name: "Try it as a Guest" });
  await expect(tryAsGuest).toHaveAttribute("href", "/guest");
  await tryAsGuest.click();

  await expect(page).toHaveURL(/\/guest$/, { timeout: 15_000 });
  await expect(page).toHaveTitle("Guest Page · Qurator");
  // The header has the wordmark, its "Guest" tag and one way on: no app pages, no Sign out.
  const header = page.getByRole("banner");
  await expect(header.getByRole("link")).toHaveCount(2);
  await expect(header.getByRole("link", { name: "Qurator" })).toBeVisible();
  await expect(header.getByText("Guest", { exact: true })).toBeVisible();
  await expect(header.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/sign-up");
  await expect(header.getByRole("button")).toHaveCount(0);
  await expect(header.getByRole("navigation")).toHaveCount(0);

  // The same steps as a signed-in user's, here a Face Photo's.
  await page.getByText("Face Photo", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("tab", { name: "Upload" }).click();
  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose a photo/ }).click();
  await (await fileChooser).setFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: await plainPhoto() });
  await expect(page.getByText("Uses your one Guest Consultation")).toBeVisible();

  // "Get my Outfits" names the details left out, before anything is sent.
  await page.getByRole("button", { name: "Get my Outfits" }).click();
  await expect(page.getByText("Add your date of birth, Style Preference and Country to get your Outfits.")).toBeVisible();
  await expect(consentSheet(page)).toBeHidden();
  await page.getByLabel("Day").fill("17");
  await page.getByLabel("Month").selectOption("5");
  await page.getByLabel("Year").fill("1990");
  await page.getByLabel("Style Preference").selectOption("Womenswear");
  await page.getByLabel("Country").selectOption("US");

  // The consent sheet asks for the Terms too.
  await page.getByRole("button", { name: "Get my Outfits" }).click();
  const sheet = consentSheet(page);
  const continueButton = sheet.getByRole("button", { name: "Continue" });
  await expect(sheet.getByRole("checkbox")).toHaveCount(3);
  await sheet.getByRole("checkbox", { name: /storing my photos/ }).check();
  await sheet.getByRole("checkbox", { name: /Google's Gemini/ }).check();
  await expect(continueButton).toBeDisabled();
  await sheet.getByRole("checkbox", { name: /Terms and Privacy Policy/ }).check();
  await continueButton.click();

  // The Styling runs as anyone's does, on the Guest Page itself, to its two Outfits.
  const outfitTitles = page.getByRole("heading", { name: /^Outfit \d · Inspired by / });
  await expect(outfitTitles).toHaveText([/^Outfit 1 · /, /^Outfit 2 · /], { timeout: 90_000 });
  await expect(page).toHaveURL(/\/guest$/);
  await expect(page.getByText("AI-generated")).toHaveCount(2);

  // Coming back within the hour shows them again.
  await page.reload();
  await expect(outfitTitles).toHaveCount(2);
});
