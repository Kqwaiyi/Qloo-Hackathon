import { expect, test } from "@playwright/test";

import { signUpNewUser } from "./support";

test("a signed-in user moves between the app pages from the header, then signs out and is kept out", async ({ page }) => {
  await signUpNewUser(page);
  const header = page.getByRole("navigation", { name: "Main" });

  for (const [link, url] of [
    ["My Consultations", /\/consultations$/],
    ["Settings", /\/settings$/],
    ["New Consultation", /\/consultations\/new$/],
  ] as const) {
    await header.getByRole("link", { name: link }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { level: 1, name: link })).toBeVisible();
    await expect(header).toBeVisible();
    await expect(header.getByRole("link", { name: link })).toHaveAttribute("aria-current", "page");
  }

  await header.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/consultations");
  await expect(page).toHaveURL(/\/sign-in$/);
});
