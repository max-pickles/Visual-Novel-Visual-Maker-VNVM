import { test, expect, openApp, openProject } from "./fixtures";
import { stageProject } from "./projects";

/** A small image, served for each of the project's image files. */
const IMAGE = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';

test("the scene editor's preview starts a scene with what the story showed before it", async ({ page }) => {
  await openApp(page, { project: stageProject });
  // openApp blocks every file request; serve the images the project uses.
  await page.route(
    (url) => url.hostname === "asset.localhost" && /\/games\/Stage\/images\/(room|cat|eve|base|eyes)\.png$/.test(decodeURIComponent(url.pathname)),
    (route) => route.fulfill({ contentType: "image/svg+xml", body: IMAGE }),
  );
  await openProject(page, "Stage");
  await page.getByRole("button", { name: /Show UI/ }).click();
  await page.locator(".node-card").getByText("second", { exact: true }).click();
  await page.getByRole("button", { name: "➡️ Enter", exact: true }).click();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("paragraph").getByText("Layered hello.", { exact: true })).toBeVisible();

  // The first scene's background, image and speaker are still on screen...
  await expect(page.locator('img[alt="bg"][src$="room.png"]')).toBeVisible();
  await expect(page.locator('img[alt="sprite"][src$="cat.png"]')).toBeVisible();
  await expect(page.locator('img[alt="sprite"][src$="eve.png"]')).toBeVisible();
  // ...and the layered character speaking the selected line shows with both layers.
  await expect(page.locator('img[alt="sprite"][src$="base.png"]')).toBeVisible();
  await expect(page.locator('img[alt=""][src$="eyes.png"]')).toBeVisible();
});
