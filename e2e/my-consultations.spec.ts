import { expect, test } from "@playwright/test";

import { agreeOnConsentSheet, plainPhoto, signUpVerifiedUser } from "./support";

test("a Consultation opens from My Consultations, and is deleted for good after a confirmation", async ({ page }) => {
  // Its Styling calls live Qloo, and in development each page compiles on its first visit.
  test.setTimeout(120_000);
  await signUpVerifiedUser(page);

  // A Face Photo's Styling makes the fewest Qloo calls. Its radio is hidden inside its card.
  await page.getByText("Face Photo", { exact: true }).click();
  await expect(page.getByRole("radio", { name: /Face Photo/ })).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("tab", { name: "Upload" }).click();
  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose a photo/ }).click();
  await (await fileChooser).setFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: await plainPhoto() });
  await page.getByRole("button", { name: "Get my Outfits" }).click();
  await agreeOnConsentSheet(page);
  await expect(page).toHaveURL(/\/consultations\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  const consultationUrl = page.url();

  await page.getByRole("link", { name: "My Consultations", exact: true }).click();
  const rows = page.getByRole("list", { name: "Consultations" }).getByRole("listitem");
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Face Photo");
  await rows.getByRole("link", { name: /^Open/ }).click();
  await expect(page).toHaveURL(consultationUrl);
  await expect(page.getByRole("heading", { name: "Your Outfits" })).toBeVisible();

  // Whether or not it's still Styling: deleting cancels a Styling under way.
  await page.getByRole("link", { name: "My Consultations", exact: true }).click();
  await rows.getByRole("button", { name: /^Delete the Face Photo Consultation/ }).click();
  const dialog = page.getByRole("dialog", { name: "Delete this Consultation?" });
  await expect(dialog).toContainText("Its photo, Outfits and Previews are deleted for good.");
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.getByText("No Consultations yet.")).toBeVisible();
  await expect(rows).toHaveCount(0);
  expect((await page.goto(consultationUrl))?.status()).toBe(404);
});
