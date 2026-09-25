/**
 * pyExpr.ts — Evaluate the small Python expressions used in VN conditions and
 * setvar values (`points >= 3 and not met_eileen`, `points + 1`,
 * `"key" in items`) for the in-app playtest.
 *
 * The playtest used to translate these to JavaScript and run them with
 * `new Function`, which executed whatever code a project file contained. This
 * module parses the expression instead and only evaluates literals, variables,
 * operators and a few pure builtins — nothing else is reachable.
 *
 * Supported: numbers, strings, True/False/None, lists, dicts, tuples (as
 * lists); `or`, `and`, `not`, `x if c else y`; comparisons (chained), `in`,
 * `not in`, `is`, `is not`; `+ - * / // % **`, unary `-`/`+`; indexing,
 * attribute reads on dicts, and len/abs/min/max/int/float/str/bool/round/sum.
 */

export type PyValue = boolean | number | string | null | PyValue[] | { [key: string]: PyValue };

// ─── Tokenizer ────────────────────────────────────────────────────────────────

type Token =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "name"; v: string }
  | { t: "op"; v: string }
  | { t: "end" };

const NUMBER = /^(?:\d+\.?\d*(?:[eE][-+]?\d+)?|\.\d+(?:[eE][-+]?\d+)?)/;
const STRING_START = /^[rRuU]?(["'])/;
const NAME = /^[A-Za-z_][A-Za-z0-9_]*/;
const OPERATOR = /^(?:\*\*|\/\/|==|!=|<=|>=|[-+*/%<>()[\],.:{}])/;
const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", "0": "\0" };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue; }
    const rest = src.slice(i);

    const num = NUMBER.exec(rest);
    if (num) { tokens.push({ t: "num", v: parseFloat(num[0]) }); i += num[0].length; continue; }

    const str = STRING_START.exec(rest);
    if (str) {
      const raw = /^[rR]/.test(str[0]);
      const quote = str[1];
      let j = i + str[0].length;
      let out = "";
      while (j < src.length && src[j] !== quote) {
        if (src[j] === "\\" && !raw && j + 1 < src.length) {
          out += ESCAPES[src[j + 1]] ?? src[j + 1];
          j += 2;
        } else {
          out += src[j++];
        }
      }
      if (j >= src.length) throw new SyntaxError("unterminated string");
      tokens.push({ t: "str", v: out });
      i = j + 1;
      continue;
    }

    const name = NAME.exec(rest);
    if (name) { tokens.push({ t: "name", v: name[0] }); i += name[0].length; continue; }

    const op = OPERATOR.exec(rest);
    if (op) { tokens.push({ t: "op", v: op[0] }); i += op[0].length; continue; }

    throw new SyntaxError(`unexpected character ${JSON.stringify(src[i])}`);
  }
  tokens.push({ t: "end" });
  return tokens;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

type Node =
  | { k: "lit"; v: PyValue }
  | { k: "name"; id: string }
  | { k: "list"; items: Node[] }
  | { k: "dict"; entries: [Node, Node][] }
  | { k: "unary"; op: string; arg: Node }
  | { k: "bin"; op: string; l: Node; r: Node }
  | { k: "bool"; op: "and" | "or"; l: Node; r: Node }
  | { k: "cmp"; first: Node; rest: [string, Node][] }
  | { k: "ternary"; test: Node; body: Node; orelse: Node }
  | { k: "call"; fn: Node; args: Node[] }
  | { k: "index"; obj: Node; idx: Node }
  | { k: "attr"; obj: Node; name: string };

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): Node {
    const node = this.ternary();
    if (this.peek().t !== "end") throw new SyntaxError("unexpected input after expression");
    return node;
  }

  private peek(): Token { return this.tokens[this.pos]; }
  private next(): Token { return this.tokens[this.pos++]; }
  private isOp(v: string): boolean { const t = this.peek(); return t.t === "op" && t.v === v; }
  private isName(v: string): boolean { const t = this.peek(); return t.t === "name" && t.v === v; }
  private expectOp(v: string): void {
    if (!this.isOp(v)) throw new SyntaxError(`expected "${v}"`);
    this.pos++;
  }

  private ternary(): Node {
    const body = this.or();
    if (!this.isName("if")) return body;
    this.pos++;
    const test = this.or();
    if (!this.isName("else")) throw new SyntaxError('expected "else"');
    this.pos++;
    return { k: "ternary", test, body, orelse: this.ternary() };
  }

  private or(): Node {
    let node = this.and();
    while (this.isName("or")) { this.pos++; node = { k: "bool", op: "or", l: node, r: this.and() }; }
    return node;
  }

  private and(): Node {
    let node = this.not();
    while (this.isName("and")) { this.pos++; node = { k: "bool", op: "and", l: node, r: this.not() }; }
    return node;
  }

  private not(): Node {
    if (this.isName("not")) { this.pos++; return { k: "unary", op: "not", arg: this.not() }; }
    return this.comparison();
  }

  private comparison(): Node {
    const first = this.sum();
    const rest: [string, Node][] = [];
    for (;;) {
      const t = this.peek();
      let op: string | null = null;
      if (t.t === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(t.v)) { op = t.v; this.pos++; }
      else if (this.isName("in")) { op = "in"; this.pos++; }
      else if (this.isName("not") && this.tokens[this.pos + 1]?.t === "name" && (this.tokens[this.pos + 1] as { v: string }).v === "in") { op = "not in"; this.pos += 2; }
      else if (this.isName("is")) {
        this.pos++;
        if (this.isName("not")) { this.pos++; op = "is not"; } else op = "is";
      }
      if (!op) break;
      rest.push([op, this.sum()]);
    }
    return rest.length ? { k: "cmp", first, rest } : first;
  }

  private sum(): Node {
    let node = this.term();
    while (this.isOp("+") || this.isOp("-")) {
      const op = (this.next() as { v: string }).v;
      node = { k: "bin", op, l: node, r: this.term() };
    }
    return node;
  }

  private term(): Node {
    let node = this.factor();
    while (this.isOp("*") || this.isOp("/") || this.isOp("//") || this.isOp("%")) {
      const op = (this.next() as { v: string }).v;
      node = { k: "bin", op, l: node, r: this.factor() };
    }
    return node;
  }

  private factor(): Node {
    if (this.isOp("-") || this.isOp("+")) {
      const op = (this.next() as { v: string }).v;
      return { k: "unary", op, arg: this.factor() };
    }
    return this.power();
  }

  private power(): Node {
    const base = this.primary();
    if (this.isOp("**")) { this.pos++; return { k: "bin", op: "**", l: base, r: this.factor() }; }
    return base;
  }

  private primary(): Node {
    let node = this.atom();
    for (;;) {
      if (this.isOp("(")) {
        this.pos++;
        node = { k: "call", fn: node, args: this.items(")") };
      } else if (this.isOp("[")) {
        this.pos++;
        const idx = this.ternary();
        this.expectOp("]");
        node = { k: "index", obj: node, idx };
      } else if (this.isOp(".")) {
        this.pos++;
        const t = this.next();
        if (t.t !== "name") throw new SyntaxError("expected attribute name");
        node = { k: "attr", obj: node, name: t.v };
      } else {
        return node;
      }
    }
  }

  /** Comma-separated expressions up to `close` (which is consumed). */
  private items(close: string): Node[] {
    const out: Node[] = [];
    while (!this.isOp(close)) {
      out.push(this.ternary());
      if (!this.isOp(",")) break;
      this.pos++;
    }
    this.expectOp(close);
    return out;
  }

  private atom(): Node {
    const t = this.next();
    if (t.t === "num") return { k: "lit", v: t.v };
    if (t.t === "str") {
      let v = t.v;
      while (this.peek().t === "str") v += (this.next() as { v: string }).v; // "a" "b"
      return { k: "lit", v };
    }
    if (t.t === "name") {
      if (t.v === "True") return { k: "lit", v: true };
      if (t.v === "False") return { k: "lit", v: false };
      if (t.v === "None") return { k: "lit", v: null };
      return { k: "name", id: t.v };
    }
    if (t.t === "op" && t.v === "(") {
      if (this.isOp(")")) { this.pos++; return { k: "list", items: [] }; }
      const first = this.ternary();
      if (this.isOp(")")) { this.pos++; return first; }
      this.expectOp(",");
      return { k: "list", items: [first, ...this.items(")")] }; // tuple
    }
    if (t.t === "op" && t.v === "[") return { k: "list", items: this.items("]") };
    if (t.t === "op" && t.v === "{") {
      const entries: [Node, Node][] = [];
      while (!this.isOp("}")) {
        const key = this.ternary();
        this.expectOp(":");
        entries.push([key, this.ternary()]);
        if (!this.isOp(",")) break;
        this.pos++;
      }
      this.expectOp("}");
      return { k: "dict", entries };
    }
    throw new SyntaxError("unexpected end of expression");
  }
}

// ─── Evaluator ────────────────────────────────────────────────────────────────

const isDict = (v: PyValue): v is { [key: string]: PyValue } =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const num = (v: PyValue, op: string): number => {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  throw new TypeError(`unsupported operand for ${op}: ${JSON.stringify(v)}`);
};

/** Python truthiness: False, None, 0, "", [] and {} are false. */
export function pyTruthy(v: PyValue): boolean {
  if (Array.isArray(v)) return v.length > 0;
  if (isDict(v)) return Object.keys(v).length > 0;
  return Boolean(v);
}

function pyEquals(a: PyValue, b: PyValue): boolean {
  if (typeof a === "boolean" || typeof b === "boolean") {
    if (typeof a !== "string" && typeof b !== "string" && !Array.isArray(a) && !Array.isArray(b) && !isDict(a) && !isDict(b)) {
      return (a === null || b === null) ? a === b : num(a, "==") === num(b, "==");
    }
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => pyEquals(x, b[i]));
  if (isDict(a) && isDict(b)) {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && pyEquals(a[k], b[k]));
  }
  return a === b;
}

function compare(op: string, a: PyValue, b: PyValue): boolean {
  switch (op) {
    case "==": return pyEquals(a, b);
    case "!=": return !pyEquals(a, b);
    case "in":
    case "not in": {
      let found: boolean;
      if (typeof b === "string" && typeof a === "string") found = b.includes(a);
      else if (Array.isArray(b)) found = b.some(x => pyEquals(x, a));
      else if (isDict(b) && typeof a === "string") found = Object.prototype.hasOwnProperty.call(b, a);
      else throw new TypeError(`argument of type ${JSON.stringify(b)} is not iterable`);
      return op === "in" ? found : !found;
    }
    case "is": return a === b;
    case "is not": return a !== b;
  }
  if (typeof a === "string" && typeof b === "string") {
    return op === "<" ? a < b : op === "<=" ? a <= b : op === ">" ? a > b : a >= b;
  }
  const x = num(a, op), y = num(b, op);
  return op === "<" ? x < y : op === "<=" ? x <= y : op === ">" ? x > y : x >= y;
}

function arithmetic(op: string, a: PyValue, b: PyValue): PyValue {
  if (op === "+") {
    if (typeof a === "string" && typeof b === "string") return a + b;
    if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
    return num(a, op) + num(b, op);
  }
  if (op === "*") {
    if (typeof a === "number" && (typeof b === "string" || Array.isArray(b))) [a, b] = [b, a];
    if (typeof a === "string" && typeof b === "number") return a.repeat(Math.max(0, b));
    if (Array.isArray(a) && typeof b === "number") return Array.from({ length: Math.max(0, b) }, () => a).flat();
    return num(a, op) * num(b, op);
  }
  const x = num(a, op), y = num(b, op);
  if ((op === "/" || op === "//" || op === "%") && y === 0) throw new RangeError("division by zero");
  switch (op) {
    case "-": return x - y;
    case "/": return x / y;
    case "//": return Math.floor(x / y);
    case "%": return ((x % y) + y) % y;
    case "**": return x ** y;
  }
  throw new SyntaxError(`unknown operator ${op}`);
}

function toStr(v: PyValue): string {
  if (v === true) return "True";
  if (v === false) return "False";
  if (v === null) return "None";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
}

const BUILTINS: Record<string, (...args: PyValue[]) => PyValue> = {
  len: (v) => {
    if (typeof v === "string" || Array.isArray(v)) return v.length;
    if (isDict(v)) return Object.keys(v).length;
    throw new TypeError("object has no len()");
  },
  abs: (v) => Math.abs(num(v, "abs")),
  min: (...a) => Math.min(...(a.length === 1 && Array.isArray(a[0]) ? a[0] : a).map(x => num(x, "min"))),
  max: (...a) => Math.max(...(a.length === 1 && Array.isArray(a[0]) ? a[0] : a).map(x => num(x, "max"))),
  sum: (v) => (Array.isArray(v) ? v : []).reduce<number>((t, x) => t + num(x, "sum"), 0),
  int: (v) => {
    const n = typeof v === "string" ? Number(v.trim()) : num(v, "int");
    if (Number.isNaN(n)) throw new TypeError(`invalid literal for int(): ${JSON.stringify(v)}`);
    return Math.trunc(n);
  },
  float: (v) => {
    const n = typeof v === "string" ? Number(v.trim()) : num(v, "float");
    if (Number.isNaN(n)) throw new TypeError(`could not convert ${JSON.stringify(v)} to float`);
    return n;
  },
  str: (v) => toStr(v),
  bool: (v) => pyTruthy(v),
  round: (v, digits) => {
    const f = 10 ** (digits === undefined ? 0 : num(digits, "round"));
    return Math.round(num(v, "round") * f) / f;
  },
};

function evaluate(node: Node, vars: Record<string, unknown>): PyValue {
  switch (node.k) {
    case "lit": return node.v;
    case "name":
      if (Object.prototype.hasOwnProperty.call(vars, node.id)) return vars[node.id] as PyValue;
      throw new ReferenceError(`name '${node.id}' is not defined`);
    case "list": return node.items.map(n => evaluate(n, vars));
    case "dict": {
      const out: { [key: string]: PyValue } = {};
      for (const [k, v] of node.entries) out[toStr(evaluate(k, vars))] = evaluate(v, vars);
      return out;
    }
    case "unary": {
      const v = evaluate(node.arg, vars);
      if (node.op === "not") return !pyTruthy(v);
      return node.op === "-" ? -num(v, "-") : num(v, "+");
    }
    case "bool": {
      const l = evaluate(node.l, vars);
      if (node.op === "and") return pyTruthy(l) ? evaluate(node.r, vars) : l;
      return pyTruthy(l) ? l : evaluate(node.r, vars);
    }
    case "cmp": {
      let left = evaluate(node.first, vars);
      for (const [op, rightNode] of node.rest) {
        const right = evaluate(rightNode, vars);
        if (!compare(op, left, right)) return false;
        left = right;
      }
      return true;
    }
    case "ternary":
      return pyTruthy(evaluate(node.test, vars)) ? evaluate(node.body, vars) : evaluate(node.orelse, vars);
    case "bin":
      return arithmetic(node.op, evaluate(node.l, vars), evaluate(node.r, vars));
    case "call": {
      if (node.fn.k !== "name" || !Object.prototype.hasOwnProperty.call(BUILTINS, node.fn.id)) {
        throw new TypeError("only len, abs, min, max, sum, int, float, str, bool and round can be called");
      }
      return BUILTINS[node.fn.id](...node.args.map(a => evaluate(a, vars)));
    }
    case "index": {
      const obj = evaluate(node.obj, vars);
      const idx = evaluate(node.idx, vars);
      if ((typeof obj === "string" || Array.isArray(obj)) && typeof idx === "number") {
        const i = idx < 0 ? obj.length + idx : idx;
        if (!Number.isInteger(i) || i < 0 || i >= obj.length) throw new RangeError("index out of range");
        return obj[i];
      }
      if (isDict(obj) && Object.prototype.hasOwnProperty.call(obj, toStr(idx))) return obj[toStr(idx)];
      throw new TypeError(`can't index ${JSON.stringify(obj)} with ${JSON.stringify(idx)}`);
    }
    case "attr": {
      const obj = evaluate(node.obj, vars);
      if (isDict(obj) && Object.prototype.hasOwnProperty.call(obj, node.name)) return obj[node.name];
      throw new TypeError(`no attribute '${node.name}'`);
    }
  }
}

/**
 * Evaluate a Python expression with `vars` as the only names in scope.
 * Throws on syntax errors, unknown names and unsupported operations.
 */
export function evalPy(expr: string, vars: Record<string, unknown>): PyValue {
  return evaluate(new Parser(tokenize(expr)).parse(), vars);
}
