import type { Page } from "@playwright/test";
import { test, expect, openApp, createProject, lastSavedProject, saveCount } from "./fixtures";

const connectorMode = (page: Page) => page.getByRole("button", { name: /Connector Mode/ });

/** The label on a scene's card in the graph. */
const sceneCard = (page: Page, label: string) => page.locator(".node-card").getByText(label, { exact: true });

async function save(page: Page) {
  const saves = await saveCount(page);
  await page.keyboard.press("Control+s");
  await expect.poll(() => saveCount(page)).toBe(saves + 1);
  return lastSavedProject(page);
}

/**
 * A point on empty canvas well away from `from`, found by probing what's under
 * each point, so the test doesn't depend on the demo story's layout or zoom.
 */
const emptyCanvasSpot = (page: Page, from: { x: number; y: number }) =>
  page.evaluate((from) => {
    // The element behind the dotted grid is what a point hits when nothing else is there.
    const canvas = document.querySelector('rect[fill="url(#grid)"]')?.closest("svg")?.parentElement;
    if (!canvas) throw new Error("The canvas isn't showing");
    const box = canvas.getBoundingClientRect();
    const empty = (x: number, y: number) =>
      [[0, 0], [-30, 0], [30, 0], [0, -30], [0, 30]].every(([dx, dy]) => document.elementFromPoint(x + dx, y + dy) === canvas);
    for (let y = box.bottom - 40; y > box.top + 40; y -= 20) {
      for (let x = box.left + 40; x < box.right - 40; x += 20) {
        if (Math.hypot(x - from.x, y - from.y) > 300 && empty(x, y)) return { x, y };
      }
    }
    throw new Error("No empty spot on the canvas");
  }, from);

/** Drag a connection from a scene's port to empty canvas, which opens the connection menu. */
async function dragConnection(page: Page, from: string) {
  await sceneCard(page, from).click();
  // The selected scene's connection port. It pops out with an animation; pressing
  // it before that ends can land on the card and drag the scene instead.
  const port = page.locator('.node-card.selected div[style*="cursor: crosshair"]');
  await port.evaluate((el) => Promise.allSettled(el.getAnimations().map((a) => a.finished)));
  await port.hover();
  const start = await port.boundingBox();
  const target = await emptyCanvasSpot(page, start!);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByText("Create New Scene", { exact: true })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await createProject(page, "Canvas Test", { demo: true });
  await page.getByRole("button", { name: /Show UI/ }).click();
});

test("the toolbar toggles connector mode, adds notes and lays out the story", async ({ page }) => {
  const before = await lastSavedProject(page);
  await connectorMode(page).click();
  await expect(connectorMode(page)).toHaveClass(/active/);
  await page.keyboard.press("Shift+X");
  await expect(connectorMode(page)).not.toHaveClass(/active/);

  await page.getByTitle("Add a sticky note to the canvas").click();
  await page.getByTitle("Automatically organize the canvas layout").click();
  const after = await save(page);
  expect(after.sticky_notes ?? []).toHaveLength((before.sticky_notes ?? []).length + 1);
  expect(after.layout).not.toEqual(before.layout);
});

test("double-clicking a scene renames it", async ({ page }) => {
  await sceneCard(page, "good_end").dblclick();
  const name = page.locator("input:focus");
  await name.fill("renamed_scene");
  await name.press("Enter");

  const after = await save(page);
  expect(after.scenes.map((s) => s.label)).toContain("renamed_scene");
  expect(after.scenes.map((s) => s.label)).not.toContain("good_end");
});

test("dragging a connection to empty canvas can create a choice", async ({ page }) => {
  const before = await lastSavedProject(page);
  await connectorMode(page).click();
  await dragConnection(page, "good_end");
  await page.getByRole("button", { name: "Choice Option" }).click();
  await expect(page.getByText("Create Choice Block", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "+ Add Answer" }).click();
  await page.getByRole("button", { name: "Create Choice", exact: true }).click();
  await expect(page.getByText("Create Choice Block", { exact: true })).toHaveCount(0);

  const after = await save(page);
  expect(after.scenes).toHaveLength(before.scenes.length + 2);
  const choice = after.scenes.find((s) => s.label === "good_end")?.events.find((e) => e.type === "choice");
  expect(choice?.opts).toHaveLength(2);
  for (const opt of choice?.opts ?? []) expect(after.scenes.map((s) => s.id)).toContain(opt.scene);
});

test("cancelling the connection menu leaves connector mode", async ({ page }) => {
  await connectorMode(page).click();
  await dragConnection(page, "good_end");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByText("Create New Scene", { exact: true })).toHaveCount(0);
  await expect(connectorMode(page)).not.toHaveClass(/active/);
});
