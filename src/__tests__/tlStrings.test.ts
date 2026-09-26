/**
 * tlStrings.test.ts — Tests for tlStrings.ts
 */

import { translatedStrings } from "../tlStrings";

describe("translatedStrings", () => {
  it("reads the old strings of every strings block", () => {
    const script = String.raw`
translate spanish start_636ae3f5:

    # s "Hi!"
    s "¡Hola!"

translate spanish strings:

    # game/script.rpy:99
    old "Sure, but what's a \"visual novel?\""
    new "Claro, ¿pero qué es una \"novela visual?\""

    old 'Start'  # the main menu
    new 'Comenzar'

translate spanish python:
    old = "not a translation"
`;
    expect([...translatedStrings(script)]).toEqual(['Sure, but what\'s a "visual novel?"', "Start"]);
  });

  it("reads Windows line endings", () => {
    expect([...translatedStrings('translate french strings:\r\n    old "Load"\r\n    new "Charger"\r\n')]).toEqual(["Load"]);
  });
});
