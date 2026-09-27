import type { Page } from "@playwright/test";
import { test, expect, openApp, openProject, saveCount } from "./fixtures";
import { routeProject } from "./projects";

/** The user agent of the macOS app's web view, which is how the app knows it runs on a Mac. */
const MAC_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";

/** The scene editor's event cards. */
const eventCards = (page: Page) => page.locator('div[draggable="true"]');

test.describe("on a Mac", () => {
  test.use({ userAgent: MAC_USER_AGENT });

  test("⌘ shortcuts and the delete key work, and hints show ⌘", async ({ page }) => {
    await openApp(page, { project: routeProject });
    await openProject(page, "Route");
    await expect(page.locator('button[title="Graph (⌘1)"]')).toBeVisible();

    await page.keyboard.press("Meta+2");
    await expect(eventCards(page)).toHaveCount(5);

    // Backspace while typing edits the text, not the scene.
    await eventCards(page).nth(0).click();
    const text = page.locator("textarea.inspector-input").first();
    await text.click();
    await text.press("End");
    await text.press("Backspace");
    await expect(text).toHaveValue("Opening lin");
    await expect(eventCards(page)).toHaveCount(5);

    // The delete key (Backspace) deletes the selected line.
    await eventCards(page).nth(1).click();
    await page.keyboard.press("Backspace");
    await expect(eventCards(page)).toHaveCount(4);

    const saves = await saveCount(page);
    await page.keyboard.press("Meta+s");
    await expect.poll(() => saveCount(page)).toBe(saves + 1);

    await page.keyboard.press("Meta+/");
    await expect(page.getByText("⇧⌘Z", { exact: true })).toBeVisible();
  });
});

test("outside macOS, Backspace doesn't delete the selected line", async ({ page }) => {
  await openApp(page, { project: routeProject });
  await openProject(page, "Route");
  await page.keyboard.press("Control+2");
  await eventCards(page).nth(1).click();
  await page.keyboard.press("Backspace");
  await expect(eventCards(page)).toHaveCount(5);
  await page.keyboard.press("Delete");
  await expect(eventCards(page)).toHaveCount(4);
});
