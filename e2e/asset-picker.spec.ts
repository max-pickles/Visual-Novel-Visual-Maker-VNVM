import type { Page } from "@playwright/test";
import { test, expect, openApp, createProject, editorTab } from "./fixtures";

/** A new project with one achievement, whose icon is chosen in an AssetBrowser picker. */
async function openAchievement(page: Page, assets: Record<string, string[]>) {
  await openApp(page, { assets });
  await createProject(page, "Picker Test");
  await editorTab(page, "Achievements").click();
  await page.getByRole("button", { name: "+ New Achievement" }).click();
}

const openPicker = (page: Page) => page.getByRole("button", { name: "🖼 Choose Image" }).click();
const pickerTitle = (page: Page) => page.getByText("Choose Image", { exact: true });
const iconLabel = (page: Page, name: string) => page.getByText(`✓ ${name}`, { exact: true });

/** The Use button on the picker's row for `file`. */
function useButton(page: Page, file: string) {
  const use = { name: /^(✅ )?Use$/ };
  // Rows show the file's path; a row is the innermost element holding its path and a Use button.
  return page.locator("div")
    .filter({ has: page.getByText(file, { exact: true }) })
    .filter({ has: page.getByRole("button", use) })
    .last()
    .getByRole("button", use);
}

test("an audio row's Use button picks that row's file", async ({ page, allowErrors }) => {
  // Choosing a track plays it, and the mocked backend has no audio to load.
  allowErrors(/^console: Audio playback failed for all candidate paths:/);
  await openAchievement(page, { audio: ["audio/rain.ogg", "audio/theme.ogg"] });

  // With nothing selected, one click plays the file and picks it.
  await openPicker(page);
  await page.getByRole("button", { name: "🎵 Music" }).click();
  const played = page.waitForRequest((r) => r.resourceType() === "media" && r.url().includes("rain.ogg"));
  await useButton(page, "audio/rain.ogg").click();
  await played;
  await expect(pickerTitle(page)).toBeHidden();
  await expect(iconLabel(page, "rain.ogg")).toBeVisible();

  // With another file selected, the row's file is picked rather than the selected one.
  await openPicker(page);
  await page.getByRole("button", { name: "🎵 Music" }).click();
  await page.getByText("audio/rain.ogg", { exact: true }).click();
  await useButton(page, "audio/theme.ogg").click();
  await expect(pickerTitle(page)).toBeHidden();
  await expect(iconLabel(page, "theme.ogg")).toBeVisible();
});

test("Use This and the list view's Use button pick the selected image", async ({ page }) => {
  await openAchievement(page, { images: ["images/park.png", "images/room.png"] });

  await openPicker(page);
  await page.getByTitle("images/room.png").click();
  await page.getByRole("button", { name: "✅ Use This" }).last().click();
  await expect(pickerTitle(page)).toBeHidden();
  await expect(iconLabel(page, "room.png")).toBeVisible();

  await openPicker(page);
  await page.getByTitle("List view").click();
  await page.getByText("images/park.png", { exact: true }).click();
  await useButton(page, "images/park.png").click();
  await expect(pickerTitle(page)).toBeHidden();
  await expect(iconLabel(page, "park.png")).toBeVisible();
});

test("double-clicking a file in the asset picker picks it", async ({ page, allowErrors }) => {
  // Choosing a track plays it, and the mocked backend has no audio to load.
  allowErrors(/^console: Audio playback failed for all candidate paths:/);
  await openAchievement(page, { images: ["images/park.png", "images/room.png"], audio: ["audio/rain.ogg"] });

  await openPicker(page);
  await page.getByTitle("images/room.png").dblclick();
  await expect(pickerTitle(page)).toBeHidden();
  await expect(iconLabel(page, "room.png")).toBeVisible();

  // The first click opens the preview, which narrows list rows, so double-click the thumbnail.
  await openPicker(page);
  await page.getByTitle("List view").click();
  await page.getByRole("img", { name: "park.png" }).dblclick();
  await expect(pickerTitle(page)).toBeHidden();
  await expect(iconLabel(page, "park.png")).toBeVisible();

  // Double-clicking a track's play button only plays and pauses it.
  await openPicker(page);
  await page.getByRole("button", { name: "🎵 Music" }).click();
  await page.getByRole("button", { name: "▶", exact: true }).dblclick();
  await expect(pickerTitle(page)).toBeVisible();
  await page.getByText("audio/rain.ogg", { exact: true }).dblclick();
  await expect(pickerTitle(page)).toBeHidden();
  await expect(iconLabel(page, "rain.ogg")).toBeVisible();
});
