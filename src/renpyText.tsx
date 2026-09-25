/**
 * renpyText.tsx — Render Ren'Py text tags ({b}, {i}, {color=#f00}, {size=+4}…)
 * as React elements for the scene preview and the playtest.
 *
 * Text comes from the project file (and from imported .rpy scripts), so it is
 * never turned into an HTML string: tags become elements and tag values are
 * checked before they reach a style, so a line of dialogue can't inject markup
 * or event handlers.
 */
import React from "react";

/** Tags with no closing tag; they don't change how text looks, so they're dropped. */
const SELF_CLOSING = new Set(["w", "p", "nw", "fast", "done", "image", "space", "vspace", "clear"]);

const COLOR = /^(?:#[0-9a-fA-F]{3,4}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|[a-zA-Z]+)$/;
const SIZE = /^([+\-*])?(\d+(?:\.\d+)?)$/;
const ALPHA = /^\*?(\d*\.?\d+)$/;

interface TagSpec {
  element: string | null;
  style?: React.CSSProperties;
}

function tagSpec(name: string, value: string | undefined): TagSpec {
  switch (name) {
    case "b": case "i": case "u": case "s":
      return { element: name };
    case "color":
      return { element: "span", style: value && COLOR.test(value) ? { color: value } : undefined };
    case "alpha": {
      const m = value ? ALPHA.exec(value) : null;
      return { element: "span", style: m ? { opacity: Math.min(1, parseFloat(m[1])) } : undefined };
    }
    case "size": {
      const m = value ? SIZE.exec(value) : null;
      if (!m) return { element: "span" };
      const n = parseFloat(m[2]);
      const fontSize = m[1] === "+" ? `calc(1em + ${n}px)`
        : m[1] === "-" ? `calc(1em - ${n}px)`
        : m[1] === "*" ? `${n}em`
        : `${n}px`;
      return { element: "span", style: { fontSize } };
    }
    default:
      // Tags that don't affect the preview ({cps}, {font}, {a}, {k}…): keep the text.
      return { element: null };
  }
}

interface Frame {
  name: string;
  spec: TagSpec;
  children: React.ReactNode[];
}

/**
 * Turn Ren'Py dialogue text into React nodes.
 *
 * Also handles `{{` / `}}` (literal braces), and the `\n`, `\"` and `\'`
 * escape sequences found in imported scripts. An unfinished tag at the end of
 * the text (the typewriter effect cutting a line mid-tag) is left out.
 */
export function renderRenpyText(text: string): React.ReactNode {
  if (!text) return null;
  const src = text.replace(/\\"/g, '"').replace(/\\'/g, "'");
  const root: Frame = { name: "", spec: { element: null }, children: [] };
  const stack: Frame[] = [root];
  let key = 0;

  const addText = (s: string) => {
    const lines = s.split("\\n");
    lines.forEach((line, i) => {
      if (i > 0) stack[stack.length - 1].children.push(<br key={key++} />);
      if (line) stack[stack.length - 1].children.push(line);
    });
  };

  const closeTop = () => {
    const frame = stack.pop()!;
    const node = frame.spec.element
      ? React.createElement(frame.spec.element, { key: key++, style: frame.spec.style }, ...frame.children)
      : <React.Fragment key={key++}>{frame.children}</React.Fragment>;
    stack[stack.length - 1].children.push(node);
  };

  let buf = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "{" && src[i + 1] === "{") { buf += "{"; i += 2; continue; }
    if (c === "}" && src[i + 1] === "}") { buf += "}"; i += 2; continue; }
    if (c !== "{") { buf += c; i++; continue; }

    const end = src.indexOf("}", i);
    if (end === -1) break;
    if (buf) { addText(buf); buf = ""; }
    const body = src.slice(i + 1, end).trim();
    i = end + 1;

    if (body.startsWith("/")) {
      const name = body.slice(1).trim();
      const depth = stack.map(f => f.name).lastIndexOf(name);
      if (depth > 0) while (stack.length > depth) closeTop();
      continue;
    }
    const eq = body.indexOf("=");
    const name = (eq === -1 ? body : body.slice(0, eq)).trim();
    const value = eq === -1 ? undefined : body.slice(eq + 1).trim();
    if (!name || SELF_CLOSING.has(name)) continue;
    stack.push({ name, spec: tagSpec(name, value), children: [] });
  }
  if (buf) addText(buf);
  while (stack.length > 1) closeTop();
  return root.children;
}
