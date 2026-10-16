import { expect, test } from "@playwright/test";

import { plainPhoto, signUpVerifiedUser } from "./support";

test("a new Consultation shows the Styling checklist, then its two Outfits together", async ({ page }) => {
  // Its Style Icons come from live Qloo, and in development each page compiles on its first visit.
  test.setTimeout(120_000);
  await signUpVerifiedUser(page);

  await expect(page.getByRole("radio", { name: /Full-Body Photo/ })).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("tab", { name: "Upload" }).click();
  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose a photo/ }).click();
  await (await fileChooser).setFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: await plainPhoto() });
  await page.getByRole("button", { name: "Get my Outfits" }).click();

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
});
