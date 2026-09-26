import { test, expect, openApp } from "./fixtures";

test("the new-project wizard keeps what was typed when cancelled and reopened", async ({ page }) => {
  await openApp(page);
  await page.getByText("Create Project", { exact: true }).click();
  await page.locator("input:visible").first().fill("Kept Title");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  await page.getByText("Create Project", { exact: true }).click();
  await expect(page.locator("input:visible").first()).toHaveValue("Kept Title");
});

test("choosing Spanish translates the start screen", async ({ page }) => {
  await openApp(page);
  await page.getByText("Preferences", { exact: true }).click();
  await page.getByText("Language", { exact: true }).click();
  await page.getByRole("button", { name: /Spanish/ }).click();

  await expect(page.getByText("Crear Proyecto", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("pref_language"))).toBe("es");
});
