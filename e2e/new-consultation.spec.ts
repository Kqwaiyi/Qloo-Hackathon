import { expect, type Page, test } from "@playwright/test";

import { FAKE_AI_SCENARIO_COOKIE } from "../src/server/ai/fake";
import { agreeOnConsentSheet, consentSheet, plainPhoto, runDailySweep, signUpVerifiedUser } from "./support";

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

test('while a Styling runs, "See what your AI Stylist is doing" opens on the Stylist\'s Notes, which fill as it works', async ({ page, request }) => {
  // Three Stylings, their Style Icons and Brands from live Qloo.
  test.setTimeout(240_000);
  await runDailySweep(request);
  await signUpVerifiedUser(page);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("tab", { name: "Upload" }).click();
  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose a photo/ }).click();
  await (await fileChooser).setFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: await plainPhoto() });
  await page.getByRole("group", { name: "Budget Tier" }).getByText("Medium", { exact: true }).click();
  await page.getByRole("button", { name: "Get my Outfits" }).click();
  await agreeOnConsentSheet(page);
  await expect(page).toHaveURL(/\/consultations\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const outfitTitles = page.getByRole("heading", { name: /^Outfit \d · Inspired by / });
  await expect(outfitTitles).toHaveCount(2, { timeout: 90_000 });

  // "Show 2 more Outfits" has the control under its in-place checklist, collapsed.
  await page.getByRole("button", { name: "Show 2 more Outfits" }).click();
  const moreOutfits = page.getByRole("region", { name: "More Outfits" });
  const moreControl = moreOutfits.getByText("See what your AI Stylist is doing");
  const moreNotes = moreOutfits.getByRole("list", { name: "Your AI Stylist's notes so far" });
  await expect(moreControl).toBeVisible({ timeout: 15_000 });
  await expect(moreNotes).toBeHidden();
  await moreControl.click();
  const first = moreNotes.getByRole("listitem").first();
  await expect(first).toBeVisible();
  const firstNote = await first.textContent();
  // The fake Stylist's notes to the user, and the steps its tools wrote, arrive as it works.
  const shown = await moreNotes.getByRole("listitem").count();
  await expect.poll(() => moreNotes.getByRole("listitem").count(), { timeout: 15_000 }).toBeGreaterThan(shown);
  await expect(moreNotes).toContainText(/Asked Qloo for the Brands .+'s fans favour/);

  // Coming back mid-Styling shows the notes so far.
  await page.reload();
  await moreControl.click();
  await expect(moreNotes.getByRole("listitem").first()).toHaveText(firstNote!);
  await expect(moreNotes).toContainText(/Searched .+'s (tops|bottoms|shoes): (\d+|none) in stock/, { timeout: 30_000 });
  await expect(outfitTitles).toHaveCount(4, { timeout: 90_000 });

  // A Budget Tier change's Styling step has the control under its checklist, which is unchanged.
  await page.getByLabel("Budget Tier").selectOption("Expensive");
  await page.getByRole("button", { name: "Get new Outfits" }).click();
  const checklist = page.getByRole("list", { name: "Styling progress" });
  await expect(checklist.getByRole("listitem")).toHaveText([/^Checking your photo/, /^Finding Style Icons/, /^Building Outfits/, /^Generating Previews/], {
    timeout: 15_000,
  });
  const notes = page.getByRole("list", { name: "Your AI Stylist's notes so far" });
  await expect(notes).toBeHidden();
  await page.getByText("See what your AI Stylist is doing").click();
  await expect(notes.getByRole("listitem").first()).toBeVisible();
  await expect(notes).toContainText(/Asked Qloo for the Brands .+'s fans favour/);
});

test('once Outfits appear, "Your AI Stylist\'s notes" below them has an entry for each Styling behind them, until a re-styling replaces them', async ({ page }) => {
  // Three Stylings, their Style Icons from live Qloo.
  test.setTimeout(240_000);
  await signUpVerifiedUser(page);
  await sendFacePhoto(page);
  const outfitTitles = page.getByRole("heading", { name: /^Outfit \d · Inspired by / });
  await expect(outfitTitles).toHaveCount(2, { timeout: 90_000 });

  // Collapsed, below the Outfits and above "Show 2 more Outfits".
  const control = page.getByText("Your AI Stylist's notes", { exact: true });
  const notes = page.getByRole("list", { name: "Your AI Stylist's notes", exact: true });
  const entries = notes.locator(":scope > li > p");
  const showMore = page.getByRole("button", { name: "Show 2 more Outfits" });
  await expect(notes).toBeHidden();
  const [lastOutfit, controlBox, showMoreBox] = await Promise.all([outfitTitles.last().boundingBox(), control.boundingBox(), showMore.boundingBox()]);
  expect(controlBox!.y).toBeGreaterThan(lastOutfit!.y);
  expect(controlBox!.y).toBeLessThan(showMoreBox!.y);
  await control.click();
  await expect(entries).toHaveText(["First Styling"]);
  await expect(page.getByRole("list", { name: "First Styling" })).toContainText("Asked Qloo for Style Icons popular in the United Kingdom");

  // "Show 2 more Outfits" adds its own entry after the first's.
  await showMore.click();
  await expect(outfitTitles).toHaveCount(4, { timeout: 90_000 });
  await page.reload();
  await control.click();
  await expect(entries).toHaveText(["First Styling", "Show 2 more Outfits"]);
  await expect(page.getByRole("list", { name: "Show 2 more Outfits" })).toContainText(/Saved Outfit 3, inspired by /);

  // A Photo Style change replaces the Outfits, and their notes with them.
  await page.getByRole("button", { name: "Change Photo Style" }).click();
  const photoStyle = page.getByRole("group", { name: "Photo Style" });
  await photoStyle.getByText("casual", { exact: true }).click();
  await photoStyle.getByText("edgy", { exact: true }).click();
  await page.getByRole("button", { name: "Get new Outfits" }).click();
  await expect(page.getByRole("list", { name: "Styling progress" })).toBeVisible({ timeout: 15_000 });
  await expect(outfitTitles).toHaveCount(2, { timeout: 90_000 });
  await page.reload();
  await control.click();
  await expect(entries).toHaveText(["Photo Style changed to edgy"]);
});

test("a Styling that fails keeps the AI Stylist's notes collapsed under its line, so the user can see what went wrong", async ({ page, context, baseURL }) => {
  // The Stylist keeps saving Outfits that break a rule until its 30 turns are used up.
  test.setTimeout(240_000);
  await signUpVerifiedUser(page);
  await context.addCookies([{ name: FAKE_AI_SCENARIO_COOKIE, value: "tailoring-fails", url: baseURL! }]);
  await sendFacePhoto(page);

  await expect(page.getByText("We couldn't build Outfits for this photo. Try another Photo Style.")).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText("No Outfits", { exact: true })).toBeVisible();
  const notes = page.getByRole("list", { name: "Your AI Stylist's notes on the Styling that failed" });
  await expect(notes).toBeHidden();
  await page.getByText("Your AI Stylist's notes", { exact: true }).click();
  await expect(notes).toContainText("Asked Qloo for Style Icons popular in the United Kingdom");
  await expect(notes).toContainText(/I'm saving /);
  // With no Outfits, there's no section of notes below them.
  await expect(page.getByRole("list", { name: "Your AI Stylist's notes", exact: true })).toHaveCount(0);
});

/**
 * Sends a plain Face Photo, whose Stylings make the fewest Qloo calls, agreeing on the consent sheet,
 * and lands on its new Consultation.
 */
async function sendFacePhoto(page: Page): Promise<void> {
  // Its radio is hidden inside its card.
  await page.getByText("Face Photo", { exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("tab", { name: "Upload" }).click();
  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose a photo/ }).click();
  await (await fileChooser).setFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: await plainPhoto() });
  await page.getByRole("button", { name: "Get my Outfits" }).click();
  await agreeOnConsentSheet(page);
  await expect(page).toHaveURL(/\/consultations\/[0-9a-f-]{36}$/, { timeout: 30_000 });
}
