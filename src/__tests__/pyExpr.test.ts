/**
 * pyExpr.test.ts — Tests for the playtest's Python expression evaluator.
 *
 * Uses Vitest globals (describe / it / expect) — no imports needed
 * because vite.config.ts sets `test.globals: true`.
 */

import { evalPy, pyTruthy } from "../pyExpr";

const vars = {
  points: 3,
  met_eileen: true,
  name: "Bob",
  items: ["key", "map"],
  stats: { hp: 10 },
  nothing: null,
};

describe("evalPy – literals and names", () => {
  it("evaluates literals", () => {
    expect(evalPy("42", {})).toBe(42);
    expect(evalPy("1.5e2", {})).toBe(150);
    expect(evalPy("'it\\'s'", {})).toBe("it's");
    expect(evalPy('"a" "b"', {})).toBe("ab");
    expect(evalPy("True", {})).toBe(true);
    expect(evalPy("None", {})).toBe(null);
    expect(evalPy("[1, 'a', False]", {})).toEqual([1, "a", false]);
    expect(evalPy("{'a': 1, 'b': [2]}", {})).toEqual({ a: 1, b: [2] });
    expect(evalPy("(1, 2)", {})).toEqual([1, 2]);
  });

  it("reads variables and rejects unknown names", () => {
    expect(evalPy("points", vars)).toBe(3);
    expect(() => evalPy("missing", vars)).toThrow(ReferenceError);
  });

  it("does not expose JavaScript globals or prototypes", () => {
    for (const expr of ["window", "globalThis", "constructor", "toString", "__proto__", "stats.constructor", "stats.__proto__", "items.length"]) {
      expect(() => evalPy(expr, vars)).toThrow();
    }
  });

  it("rejects calls other than the safe builtins", () => {
    expect(() => evalPy("fetch('http://example.com')", vars)).toThrow(TypeError);
    expect(() => evalPy("renpy.random.randint(1, 6)", vars)).toThrow();
    expect(() => evalPy("items.pop()", vars)).toThrow();
  });

  it("rejects anything that isn't an expression", () => {
    for (const expr of ["points = 4", "import os", "x; y", "`ls`", "points &&& 1"]) {
      expect(() => evalPy(expr, vars)).toThrow();
    }
  });
});

describe("evalPy – operators", () => {
  it("follows Python arithmetic", () => {
    expect(evalPy("points + 1", vars)).toBe(4);
    expect(evalPy("7 // 2", {})).toBe(3);
    expect(evalPy("-7 // 2", {})).toBe(-4);
    expect(evalPy("-7 % 3", {})).toBe(2);
    expect(evalPy("2 ** 3 ** 2", {})).toBe(512);
    expect(evalPy("-2 ** 2", {})).toBe(-4);
    expect(evalPy("True + 1", {})).toBe(2);
    expect(evalPy("'ab' * 2", {})).toBe("abab");
    expect(evalPy("2 * 'ab'", {})).toBe("abab");
    expect(evalPy("name + '!'", vars)).toBe("Bob!");
    expect(() => evalPy("1 / 0", {})).toThrow();
    expect(() => evalPy("name + 1", vars)).toThrow(TypeError);
  });

  it("follows Python comparisons, including chains and membership", () => {
    expect(evalPy("points >= 3 and not met_eileen", vars)).toBe(false);
    expect(evalPy("1 < points < 5", vars)).toBe(true);
    expect(evalPy("1 < points < 2", vars)).toBe(false);
    expect(evalPy("'key' in items", vars)).toBe(true);
    expect(evalPy("'sword' not in items", vars)).toBe(true);
    expect(evalPy("'o' in name", vars)).toBe(true);
    expect(evalPy("'hp' in stats", vars)).toBe(true);
    expect(evalPy("nothing is None", vars)).toBe(true);
    expect(evalPy("met_eileen is not None", vars)).toBe(true);
    expect(evalPy("True == 1", {})).toBe(true);
    expect(evalPy("'1' == 1", {})).toBe(false);
    expect(evalPy("[1, [2]] == [1, [2]]", {})).toBe(true);
  });

  it("short-circuits and/or and returns operands like Python", () => {
    expect(evalPy("met_eileen or missing", vars)).toBe(true);
    expect(evalPy("False and missing", vars)).toBe(false);
    expect(evalPy("'' or 'default'", {})).toBe("default");
    expect(() => evalPy("True and missing", vars)).toThrow(ReferenceError);
  });

  it("supports conditional expressions, indexing and attribute reads on dicts", () => {
    expect(evalPy("'yes' if met_eileen else 'no'", vars)).toBe("yes");
    expect(evalPy("items[0]", vars)).toBe("key");
    expect(evalPy("items[-1]", vars)).toBe("map");
    expect(evalPy("stats['hp'] + stats.hp", vars)).toBe(20);
    expect(() => evalPy("items[5]", vars)).toThrow();
  });

  it("supports the safe builtins", () => {
    expect(evalPy("len(items) > 1", vars)).toBe(true);
    expect(evalPy("max(points, 10)", vars)).toBe(10);
    expect(evalPy("min([4, 2, 8])", {})).toBe(2);
    expect(evalPy("int('7') + float('0.5')", {})).toBe(7.5);
    expect(evalPy("str(points) + name", vars)).toBe("3Bob");
    expect(evalPy("bool([])", {})).toBe(false);
  });
});

describe("pyTruthy", () => {
  it("matches Python truthiness", () => {
    for (const v of [false, null, 0, "", [], {}]) expect(pyTruthy(v)).toBe(false);
    for (const v of [true, 1, -1, "a", [0], { a: 1 }]) expect(pyTruthy(v)).toBe(true);
  });
});
