import type { Page } from "@playwright/test";
import { test, expect, openApp, openProject, editorTab, lastSavedProject, saveCount } from "./fixtures";
import { assetsProject } from "./projects";

/** The files the mocked backend lists for the project. */
const assets = {
  images: ["game/images/room.png"],
  audio: ["game/audio/door.ogg", "game/audio/theme.ogg", "game/voice/line_001.ogg"],
  video: ["game/movies/intro.webm"],
};

/** The n-th event (from 0) in the scene editor's event list. */
const eventCard = (page: Page, n: number) => page.locator('div[draggable="true"]').nth(n);

/** A tab ("Images", "Audio"...) or a listed file of the scene editor's asset sidebar. */
const sidebarItem = (page: Page, title: string) => page.getByTitle(title, { exact: true });

/** Save the project and return the events of its first scene. */
async function save(page: Page) {
  const saves = await saveCount(page);
  await page.keyboard.press("Control+s");
  await expect.poll(() => saveCount(page)).toBe(saves + 1);
  return (await lastSavedProject(page)).scenes[0].events;
}

test("a file picked in the scene editor's sidebar goes in the field its event uses", async ({ page }) => {
  await openApp(page, { project: assetsProject, assets });
  await openProject(page, "Assets");
  await editorTab(page, "Scenes").click();
  const before = await save(page);

  // Selecting an sfx or music event switches the sidebar to the audio files.
  await eventCard(page, 0).click();
  await sidebarItem(page, "door.ogg").click();
  await expect(page.getByText("✓ door.ogg")).toBeVisible();
  await eventCard(page, 1).click();
  await sidebarItem(page, "theme.ogg").click();

  // A narration line takes a voice.
  await eventCard(page, 2).click();
  await sidebarItem(page, "Audio").click();
  await sidebarItem(page, "line_001.ogg").click();
  await expect(page.getByText("✓ line_001.ogg")).toBeVisible();

  // A movie event takes a video, so the images tab lists videos while it's selected.
  await eventCard(page, 3).click();
  await sidebarItem(page, "intro.webm").click();
  await expect(sidebarItem(page, "room.png")).toHaveCount(0);
  await eventCard(page, 4).click();
  await sidebarItem(page, "room.png").click();

  // A jump takes no file and a background no sound, so these picks change nothing.
  await eventCard(page, 6).click();
  await sidebarItem(page, "Audio").click();
  await sidebarItem(page, "door.ogg").click();
  await eventCard(page, 4).click();
  await sidebarItem(page, "Audio").click();
  await sidebarItem(page, "theme.ogg").click();

  expect(await save(page)).toEqual([
    { ...before[0], sfx: "game/audio/door.ogg" },
    { ...before[1], music: "game/audio/theme.ogg" },
    { ...before[2], voice: "voice/line_001.ogg" },
    { ...before[3], movie: "game/movies/intro.webm" },
    { ...before[4], bg: "game/images/room.png" },
    before[5],
    before[6],
  ]);
});

test("a voice field's Open Full Browser button picks the line's voice file", async ({ page, allowErrors }) => {
  // Choosing a track in the browser plays it, and the mocked backend has no audio to load.
  allowErrors(/^console: Audio playback failed for all candidate paths:/);
  await openApp(page, { project: assetsProject, assets });
  await openProject(page, "Assets");
  await editorTab(page, "Scenes").click();
  const before = await save(page);

  // The browser opens on the audio files.
  await eventCard(page, 5).click();
  await page.getByRole("button", { name: /Open Full Browser/ }).click();
  const title = page.getByText("Choose Voice File", { exact: true });
  await expect(title).toBeVisible();
  await page.getByText("game/voice/line_001.ogg", { exact: true }).click();
  await page.getByRole("button", { name: "✅ Use This" }).click();
  await expect(title).toBeHidden();
  await expect(page.getByText("✓ line_001.ogg")).toBeVisible();

  // An image picked on its images tab isn't a voice, so it changes nothing.
  await page.getByRole("button", { name: /Open Full Browser/ }).click();
  await page.getByText("🖼 Images", { exact: true }).click();
  await page.getByTitle("game/images/room.png").click();
  await page.getByRole("button", { name: "✅ Use This" }).first().click();
  await expect(title).toBeHidden();

  expect((await save(page))[5]).toEqual({ ...before[5], voice: "voice/line_001.ogg" });
});
