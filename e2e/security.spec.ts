import { test, expect, openApp, openProject, editorTab } from "./fixtures";
import { markupProject } from "./projects";

test("text tags in dialogue can't add event handlers to the preview", async ({ page }) => {
  await openApp(page, { project: markupProject });
  await openProject(page, "Markup");
  await editorTab(page, "Scenes").click();
  // Select the dialogue line in the timeline so the preview shows it.
  await page.getByText("Eve", { exact: true }).last().click();

  await page.getByText("Hover me").first().hover({ force: true });
  await expect(page.locator("b", { hasText: /^bold$/ }).first()).toBeAttached();
  expect(await page.evaluate(() => document.querySelectorAll("[onmouseover]").length)).toBe(0);
  expect(await page.evaluate(() => "__xss" in window)).toBe(false);
});

test("the Content-Security-Policy blocks inline scripts", async ({ page, allowErrors }) => {
  allowErrors(/^console: Refused to execute inline script/);
  allowErrors(/^csp: script-src-elem blocked inline$/);
  await openApp(page);

  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.__inline = 1";
    document.body.append(script);
  });
  await expect.poll(() => page.evaluate(() => window.__cspViolations.map((v) => v.directive))).toEqual(["script-src-elem"]);
  expect(await page.evaluate(() => "__inline" in window)).toBe(false);
});
