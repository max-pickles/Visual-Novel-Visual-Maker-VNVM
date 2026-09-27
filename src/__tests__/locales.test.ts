/**
 * locales.test.ts — Checks across the UI translations in src/locales
 */

import { en } from "../locales/en";
import { es } from "../locales/es";
import { ja } from "../locales/ja";

describe("locales", () => {
  it.each([["en", en], ["es", es], ["ja", ja]] as const)("the %s picker hint names the picker's Use This button", (_, locale) => {
    const button = locale.asset_browser.use_this.replace(/^✅ /, "");
    expect(locale.editor.scene.picker_hint).toContain(button);
  });
});
