import { expect, test } from "@playwright/test";

import { FAKE_AI_SCENARIO_COOKIE } from "../src/server/ai/fake";
import { plainPhoto, signUpVerifiedUser } from "./support";

test("a photo that looks like another Photo Type is sent again as that type with one tap", async ({ page, context, baseURL }) => {
  await signUpVerifiedUser(page);
  // The fake adapter sees just a face and hair, whatever Photo Type was chosen.
  await context.addCookies([{ name: FAKE_AI_SCENARIO_COOKIE, value: "wrong-photo-type", url: baseURL! }]);

  await expect(page.getByRole("radio", { name: /Full-Body Photo/ })).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("tab", { name: "Upload" }).click();
  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Choose a photo/ }).click();
  await (await fileChooser).setFiles({ name: "me.jpg", mimeType: "image/jpeg", buffer: await plainPhoto() });
  await page.getByRole("button", { name: "Get my Outfits" }).click();

  await expect(page.getByText("This looks like a Face Photo.")).toBeVisible();
  await expect(page.getByRole("img", { name: "Your Full-Body Photo" })).toBeVisible();
  await page.getByRole("button", { name: "Use it as a Face Photo" }).click();

  // In development, the first visit compiles the Consultation page while its first Styling starts.
  await expect(page).toHaveURL(/\/consultations\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Your Outfits" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Your Face Photo" })).toBeVisible();
});
