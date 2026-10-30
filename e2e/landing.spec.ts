import { expect, type Page, test } from "@playwright/test";

import { signUpNewUser } from "./support";

/** Console errors and failed loads while a page is open, so a test can say there were none. */
function watchForErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("a visitor is offered the Guest Page, and follows the walkthrough's promise to the call to action, then on to sign up", async ({ page }) => {
  const errors = watchForErrors(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "One photo, complete Outfits" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try it as a Guest" })).toHaveAttribute("href", "/guest");

  const getStarted = page.locator("#get-started");
  await getStarted.scrollIntoViewIfNeeded();
  await expect(getStarted).toBeInViewport();
  await expect(getStarted).toContainText("Your photos go to Google's Gemini to make your Previews.");

  await getStarted.getByRole("link", { name: "Create a free account" }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
  expect(errors).toEqual([]);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("every chapter reads as a plain page, naming Gemini once", async ({ page }) => {
    const errors = watchForErrors(page);
    await page.goto("/");

    for (const name of [
      "What will your photo show?",
      "The AI checks the photo and reads its style.",
      "Qloo finds Style Icons",
      "…and the Brands their fans favour",
      "Your Outfit, ready to shop",
      "Careful with your photos",
      "Now try it on your own photo",
    ]) {
      const heading = page.getByRole("heading", { level: 2, name });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
    }
    // All three Photo Types show at once, with nothing pinned or hidden.
    for (const photoType of ["Face Photo", "Full-Body Photo", "Body-Only Photo"]) {
      await expect(page.getByRole("heading", { level: 3, name: photoType, exact: true }).first()).toBeVisible();
    }

    const text = await page.locator("main").innerText();
    expect(text.match(/Gemini/g)).toHaveLength(1);
    // The call to action is the last screen: nothing follows it.
    await expect(page.locator("footer")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test("a signed-in visitor sees the landing page too, offered the app instead of signing in", async ({ page }) => {
  await signUpNewUser(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "One photo, complete Outfits" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the app" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Try it as a Guest" })).toHaveCount(0);
});
