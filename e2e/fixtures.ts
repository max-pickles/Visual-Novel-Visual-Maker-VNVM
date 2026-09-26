/**
 * Shared setup for the browser smoke tests: a `test` that fails on any page
 * error or CSP violation, and helpers for driving the app.
 */
import { test as base, expect, type Page } from "@playwright/test";
import type { VNProject } from "../src/types";

/** How the mocked backend behaves; see tauri-mock.js. */
export interface MockOptions {
  project?: VNProject;
  files?: Record<string, string>;
  assets?: Record<string, string[]>;
  dialogAnswers?: string[];
  /** localStorage entries set before the app starts (preferences). */
  localStorage?: Record<string, string>;
}

declare global {
  interface Window {
    __VNV_MOCK__?: MockOptions;
    __calls: [string, Record<string, unknown>][];
    __dialogs: Record<string, unknown>[];
    __cspViolations: { directive: string; blocked: string; sample: string }[];
  }
}

export const test = base.extend<{ allowErrors: (pattern: RegExp) => void }>({
  /**
   * Fails the test on page errors, console errors and CSP violations. A test
   * that expects one passes a pattern for it to `allowErrors`.
   */
  allowErrors: [
    async ({ page }, use) => {
      // Requests openApp blocks (web fonts, asset:// files) fail like this.
      const allowed = [/^console: Failed to load resource: net::ERR_FAILED$/];
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(`console: ${m.text()}`);
      });
      await use((pattern) => allowed.push(pattern));
      const violations = await page.evaluate(() => window.__cspViolations ?? []).catch(() => []);
      errors.push(...violations.map((v) => `csp: ${v.directive} blocked ${v.blocked}`));
      expect(errors.filter((e) => !allowed.some((re) => re.test(e))), "errors in the page").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Start the app on the start screen with a mocked backend. */
export async function openApp(page: Page, mock: MockOptions = {}) {
  // Keep the tests offline: only the local server answers (no web fonts or asset:// files).
  await page.route((url) => url.hostname !== "127.0.0.1", (route) => route.abort());
  await page.addInitScript((mock: MockOptions) => {
    window.__VNV_MOCK__ = mock;
    for (const [key, value] of Object.entries(mock.localStorage ?? {})) localStorage.setItem(key, value);
  }, mock);
  await page.addInitScript({ path: `${test.info().project.testDir}/tauri-mock.js` });
  await page.goto("/");
  await expect(page.getByText("Create Project", { exact: true })).toBeVisible();
}

/** Run the new-project wizard and wait for the editor. */
export async function createProject(page: Page, title: string, { demo = false } = {}) {
  await page.getByText("Create Project", { exact: true }).click();
  await page.locator("input:visible").first().fill(title);
  await page.getByRole("button", { name: /Continue/ }).click();
  if (demo) await page.getByText("Demo Project", { exact: true }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: "✨ Create Project" }).click();
  await expect(editorTab(page, "Graph")).toBeVisible();
}

/** Open a project from the Open Project list (the mock lists `mock.project`). */
export async function openProject(page: Page, title: string) {
  await page.getByRole("button", { name: /^Open Project/ }).click();
  await page.getByText(title, { exact: true }).click();
  await expect(editorTab(page, "Graph")).toBeVisible();
}

/** The editor's tab button with this label ("Graph", "Scenes", ...). */
export const editorTab = (page: Page, label: string) => page.locator(`button[title^="${label} (Ctrl+"]`);

/** The editor's Back button, which closes the project. */
export const backButton = (page: Page) => page.getByRole("button", { name: "← Back", exact: true });

/** How many times the project file has been saved. */
export const saveCount = (page: Page) => page.evaluate(() => window.__calls.filter(([cmd]) => cmd === "save_vnv_project").length);

/** The project as it was last saved. */
export async function lastSavedProject(page: Page): Promise<VNProject> {
  const content = await page.evaluate(() => window.__calls.filter(([cmd]) => cmd === "save_vnv_project").pop()?.[1].content);
  if (typeof content !== "string") throw new Error("The project hasn't been saved");
  return JSON.parse(content);
}

/** What was last written to the file whose path ends with `suffix`, or null. */
export const lastWrite = (page: Page, suffix: string) =>
  page.evaluate((suffix) => {
    const writes = window.__calls.filter(([cmd, args]) => cmd === "write_text_file" && String(args.path).endsWith(suffix));
    return (writes.pop()?.[1].content as string | undefined) ?? null;
  }, suffix);
