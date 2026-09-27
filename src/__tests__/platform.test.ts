/**
 * platform.test.ts — Tests for platform.ts: how shortcuts are written and
 * which key deletes, on a Mac and elsewhere.
 */

import { isDeleteKey, shortcutLabel } from "../platform";

describe("shortcutLabel", () => {
  it("keeps shortcuts as they are written on Windows and Linux", () => {
    expect(shortcutLabel("Ctrl+Shift+Z", false)).toBe("Ctrl+Shift+Z");
  });

  it("writes them with ⌘ and the other Mac symbols on a Mac, in the order macOS lists them", () => {
    expect(shortcutLabel("Ctrl+S", true)).toBe("⌘S");
    expect(shortcutLabel("Ctrl+Shift+Z", true)).toBe("⇧⌘Z");
    expect(shortcutLabel("Shift+Ctrl+F", true)).toBe("⇧⌘F");
    expect(shortcutLabel("Ctrl+Alt+P", true)).toBe("⌥⌘P");
    expect(shortcutLabel("Ctrl+1…9", true)).toBe("⌘1…9");
    expect(shortcutLabel("Ctrl+/", true)).toBe("⌘/");
  });

  it("leaves keys without modifiers, and modifiers it doesn't know, as they are", () => {
    expect(shortcutLabel("Delete", true)).toBe("Delete");
    expect(shortcutLabel("↑ / ↓", true)).toBe("↑ / ↓");
    expect(shortcutLabel("Double-click", true)).toBe("Double-click");
    expect(shortcutLabel("Meta+K", true)).toBe("Meta+K");
  });
});

describe("isDeleteKey", () => {
  it("is Delete everywhere, and Backspace (a Mac keyboard's delete key) only on a Mac", () => {
    expect(isDeleteKey({ key: "Delete" }, false)).toBe(true);
    expect(isDeleteKey({ key: "Delete" }, true)).toBe(true);
    expect(isDeleteKey({ key: "Backspace" }, true)).toBe(true);
    expect(isDeleteKey({ key: "Backspace" }, false)).toBe(false);
    expect(isDeleteKey({ key: "d" }, true)).toBe(false);
  });
});
