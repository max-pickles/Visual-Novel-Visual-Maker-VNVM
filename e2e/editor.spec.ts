import { test, expect, openApp, createProject, editorTab, lastWrite } from "./fixtures";

const TABS = [
  "Graph", "Scenes", "GUI", "Characters", "Assets", "Voice", "Translate", "Bot",
  "Variables", "Achievements", "Script", "Diagnostics", "Stats", "Playtest", "Export",
];
const GUI_SCREENS = ["Textbox / In-Game", "Load", "Preferences", "About", "Help", "Main Menu"];

test("every tab renders the demo project", async ({ page }) => {
  await openApp(page);
  await createProject(page, "Tabs Test", { demo: true });

  for (const tab of TABS) {
    await editorTab(page, tab).click();
    await expect(editorTab(page, tab), `${tab} tab is active`).toHaveCSS("font-weight", "700");
    if (tab === "GUI") {
      for (const screen of GUI_SCREENS) await page.getByRole("button", { name: new RegExp(`^\\S+ ${screen}$`) }).click();
    }
  }
  await expect(page.getByText("encountered a fatal error")).toHaveCount(0);
});

test("the GUI tab reads gui.rpy and writes edits back as clean defines", async ({ page }) => {
  const gui = "define gui.accent_color = '#0099cc'  # buttons and titles\ndefine gui.idle_color = '#888888'\n";
  await openApp(page, { files: { "game/gui.rpy": gui } });
  await createProject(page, "Gui Test");
  await editorTab(page, "GUI").click();

  const accent = page.locator('label:text-is("Accent Color") + div input.inspector-input');
  await expect(accent).toHaveValue("#0099cc");
  await accent.fill("#123456");
  await expect
    .poll(() => lastWrite(page, "game/gui.rpy"))
    .toBe("define gui.accent_color = '#123456'  # buttons and titles\ndefine gui.idle_color = '#888888'\n");
});

test("the Export tab uses the Ren'Py SDK path from Preferences", async ({ page }) => {
  await openApp(page, { localStorage: { vnv_renpy_sdk_path: "C:/renpy-8.5-sdk" } });
  await createProject(page, "Sdk Test");
  await editorTab(page, "Export").click();

  const sdk = page.getByPlaceholder("e.g. C:/renpy-8.5-sdk");
  await expect(sdk).toHaveValue("C:/renpy-8.5-sdk");
  await sdk.fill("D:/other-sdk");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("vnv_renpy_sdk_path"))).toBe("D:/other-sdk");
});
