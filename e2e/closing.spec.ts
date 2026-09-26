import { test, expect, openApp, createProject, editorTab, backButton, saveCount } from "./fixtures";

test("leaving the editor saves unsaved changes when auto-save is on", async ({ page }) => {
  await openApp(page);
  await createProject(page, "Close Test");
  const saves = await saveCount(page);
  await page.getByTitle("Create a new narrative scene").click();
  await expect(page.getByTitle("Unsaved changes")).toBeVisible();

  await backButton(page).click();
  await expect(page.getByText("Create Project", { exact: true })).toBeVisible();
  expect(await saveCount(page)).toBe(saves + 1);
  expect(await page.evaluate(() => window.__dialogs.length)).toBe(0);
});

test("leaving the editor asks about unsaved changes when auto-save is off", async ({ page }) => {
  await openApp(page, { localStorage: { pref_autosave: "false" }, dialogAnswers: ["Cancel", "Don't Save"] });
  await createProject(page, "Close Test");
  const saves = await saveCount(page);
  await page.getByTitle("Create a new narrative scene").click();

  // Cancel stays in the editor.
  await backButton(page).click();
  await expect.poll(() => page.evaluate(() => window.__dialogs.length)).toBe(1);
  await expect(editorTab(page, "Graph")).toBeVisible();

  // Don't Save leaves without saving.
  await backButton(page).click();
  await expect(page.getByText("Create Project", { exact: true })).toBeVisible();
  expect(await saveCount(page)).toBe(saves);
  expect(await page.evaluate(() => window.__dialogs.map((d) => d.message))).toEqual([
    'Save changes to "Close Test" before closing?',
    'Save changes to "Close Test" before closing?',
  ]);
});
