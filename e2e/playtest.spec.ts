import type { Page } from "@playwright/test";
import { test, expect, openApp, openProject, editorTab } from "./fixtures";
import { logicProject, routeProject } from "./projects";

test("the playtest evaluates variables and conditions", async ({ page }) => {
  await openApp(page, { project: logicProject });
  await openProject(page, "Logic");
  await editorTab(page, "Playtest").click();

  // points = 3 and name = 'Bob', so the condition sends the story down the good branch.
  await page.getByText("Starting", { exact: true }).click();
  await expect(page.getByText("Good path reached", { exact: true })).toBeVisible();
  await expect(page.getByText(/Bad path reached|Fell through/)).toHaveCount(0);
});

/** The playtest's variable panel shows `name` with this value. */
async function expectVariable(page: Page, name: string, value: string) {
  await expect(page.locator("div.row", { hasText: new RegExp(`^${name}\\s*${value}$`) })).toBeVisible();
}

test("the playtest starts a later scene with the variables the route there sets", async ({ page }) => {
  await openApp(page, { project: routeProject });
  await openProject(page, "Route");
  await page.getByRole("button", { name: /Show UI/ }).click();
  await page.locator(".node-card").getByText("finale", { exact: true }).click();
  await page.getByRole("button", { name: /Playtest from here/ }).click();

  await expect(page.getByText("Finale line", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Debug/ }).click();
  await expectVariable(page, "met", "true");
  await expectVariable(page, "points", "13");
});

test("the scene editor plays from the selected line, in the playtest and in Ren'Py", async ({ page }) => {
  await openApp(page, { project: routeProject, localStorage: { vnv_renpy_sdk_path: "C:/renpy-8.5-sdk" } });
  await openProject(page, "Route");
  await page.getByRole("button", { name: /Show UI/ }).click();
  await page.locator(".node-card").getByText("middle", { exact: true }).click();
  await page.getByRole("button", { name: "\u27A1\uFE0F Enter", exact: true }).click();

  // Select line 3 and start there.
  for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowDown");
  await page.getByLabel("From line 3").check();

  await page.getByTitle(/^Launch Ren'Py/).click();
  const previewScript = () =>
    page.evaluate(() => window.__calls.find(([cmd]) => cmd === "launch_renpy_preview")?.[1].previewRpy as string | undefined);
  await expect.poll(previewScript).toBeTruthy();
  const script = (await previewScript())!;
  const entry = script.split("label vnv_preview_entry:\n")[1].split("\n\n")[0];
  expect(entry).toContain("## Set up as if played through opening → middle");
  expect(entry).toContain("$ points = 2");
  expect(entry).toContain("$ points = points + 1");
  expect(entry).toContain("jump vnv_preview_from");
  expect(script.split("label vnv_preview_from:\n")[1].split("\n")[0]).toBe('    "Second middle line"');

  await page.getByTitle(/^Play in the editor's Playtest/).click();
  await expect(page.getByText("Second middle line", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Debug/ }).click();
  await expectVariable(page, "met", "true");
  await expectVariable(page, "points", "3");
});
