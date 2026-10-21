import { expect, test } from "@playwright/test";

import { consentSheet, plainPhoto, runDailySweep, signUpVerifiedUser } from "./support";

test("a new Consultation asks for photo consent, then shows the Styling checklist, then its two Outfits together", async ({ page, request }) => {
  // Its Style Icons come from live Qloo, and in development each page compiles on its first visit.
  test.setTimeout(120_000);
  // The user is in the United Kingdom, whose searches need the pound's rate.
  await runDailySweep(request);
  await signUpVerifiedUser(page);

  await expect(page.getByRole("radio", { name: /Full-Body Photo/ })).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("tab", { name: "Upload" }).click();
  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose a photo/ }).click();
  await (await fileChooser).setFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: await plainPhoto() });
  // Its radio is hidden inside its label.
  await page.getByRole("group", { name: "Budget Tier" }).getByText("Medium", { exact: true }).click();

  // Closing the sheet sends nothing, and keeps the photo and the Budget Tier.
  await page.getByRole("button", { name: "Get my Outfits" }).click();
  const sheet = consentSheet(page);
  await expect(sheet).toContainText("Your photos and Previews are deleted immediately.");
  await sheet.getByRole("button", { name: "Not now" }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText("To get Outfits, agree to both boxes on the consent sheet.")).toBeVisible();
  await expect(page.getByRole("img", { name: "Your Full-Body Photo" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Medium" })).toBeChecked();

  // Continue waits for both boxes.
  await page.getByRole("button", { name: "Get my Outfits" }).click();
  const continueButton = sheet.getByRole("button", { name: "Continue" });
  await expect(sheet.getByRole("checkbox")).toHaveCount(2);
  await expect(continueButton).toBeDisabled();
  await sheet.getByRole("checkbox", { name: /storing my photos/ }).check();
  await expect(continueButton).toBeDisabled();
  await sheet.getByRole("checkbox", { name: /Google's Gemini/ }).check();
  await continueButton.click();

  const checklist = page.getByRole("list", { name: "Styling progress" });
  await expect(page.getByRole("list", { name: "Steps" }).locator("[aria-current=step]")).toContainText("Styling");
  await expect(checklist.getByRole("listitem")).toHaveText([
    /^Checking your photo/,
    /^Finding Style Icons/,
    /^Building Outfits/,
    /^Generating Previews/,
  ]);

  await expect(page).toHaveURL(/\/consultations\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const outfitTitles = page.getByRole("heading", { name: /^Outfit \d · Inspired by / });
  await expect(outfitTitles).toHaveText([/^Outfit 1 · /, /^Outfit 2 · /], { timeout: 60_000 });
  await expect(checklist).toBeHidden();
  await expect(page.getByText("AI-generated")).toHaveCount(2);

  // Each Piece is a Product from the fake product search, which the fake AI picks first: its title,
  // its price in the British market's pounds with the day it was found, and a link to its shop.
  const firstOutfit = page.getByRole("list", { name: "Outfits" }).getByRole("listitem").first();
  await expect(firstOutfit.getByText("Cropped boxy cotton shirt", { exact: true })).toBeVisible();
  await expect(firstOutfit.getByText(/^£\d+ on \d{1,2} [A-Z][a-z]{2}$/)).toHaveCount(3);
  const viewAt = firstOutfit.getByRole("link", { name: /^View at shop\.example/ });
  await expect(viewAt).toHaveCount(3);
  await expect(viewAt.first()).toHaveAttribute("target", "_blank");
  await expect(viewAt.first()).toHaveAttribute("rel", "noopener noreferrer");
  await expect(firstOutfit.getByText("Product photos © their sellers")).toBeVisible();
});
