import { expect, test } from "@playwright/test";
import sharp from "sharp";

import { FAKE_AI_SCENARIO_COOKIE } from "../src/server/ai/fake";
import { signUpNewUser } from "./support";

test("a photo that looks like another Photo Type is sent again as that type with one tap", async ({ page, context, baseURL }) => {
  await signUpNewUser(page);
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

  await expect(page).toHaveURL(/\/consultations\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Your Outfits" })).toBeVisible();
  await expect(page.getByText(/^Face Photo ·/)).toBeVisible();
});

/** A plain JPEG the browser can open. */
async function plainPhoto(): Promise<Buffer> {
  return sharp({ create: { width: 300, height: 400, channels: 3, background: "#8a7f72" } }).jpeg().toBuffer();
}
