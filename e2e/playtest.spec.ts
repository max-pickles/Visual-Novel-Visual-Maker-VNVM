import { test, expect, openApp, openProject, editorTab } from "./fixtures";
import { logicProject } from "./projects";

test("the playtest evaluates variables and conditions", async ({ page }) => {
  await openApp(page, { project: logicProject });
  await openProject(page, "Logic");
  await editorTab(page, "Playtest").click();

  // points = 3 and name = 'Bob', so the condition sends the story down the good branch.
  await page.getByText("Starting", { exact: true }).click();
  await expect(page.getByText("Good path reached", { exact: true })).toBeVisible();
  await expect(page.getByText(/Bad path reached|Fell through/)).toHaveCount(0);
});
