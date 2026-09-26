/**
 * renpyText.test.ts — Tests for renderRenpyText (renpyText.tsx).
 *
 * Uses Vitest globals (describe / it / expect) — no imports needed
 * because vite.config.ts sets `test.globals: true`.
 */

import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderRenpyText } from "../renpyText";

const html = (text: string) => renderToStaticMarkup(createElement(Fragment, null, renderRenpyText(text)));

describe("renderRenpyText – safety", () => {
  it("escapes HTML in the text", () => {
    expect(html("<img src=x onerror=alert(1)>")).toBe("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("does not let a tag value break out of the style", () => {
    const out = html("{color=red' onmouseover='alert(1)}Hi{/color}");
    expect(out).not.toMatch(/onmouseover/i);
    expect(out).toBe("<span>Hi</span>");
  });

  it("ignores size and alpha values that aren't numbers", () => {
    expect(html("{size=10px;background:url(x)}a{/size}")).toBe("<span>a</span>");
    expect(html("{alpha=0.5;color:red}a{/alpha}")).toBe("<span>a</span>");
  });
});

describe("renderRenpyText – tags", () => {
  it("renders style tags", () => {
    expect(html("{b}bold{/b} {i}it{/i} {u}u{/u} {s}s{/s}")).toBe("<b>bold</b> <i>it</i> <u>u</u> <s>s</s>");
    expect(html("{color=#ff0000}red{/color}")).toBe('<span style="color:#ff0000">red</span>');
    expect(html("{alpha=0.5}dim{/alpha}")).toBe('<span style="opacity:0.5">dim</span>');
  });

  it("renders absolute and relative sizes", () => {
    expect(html("{size=30}a{/size}")).toBe('<span style="font-size:30px">a</span>');
    expect(html("{size=+10}a{/size}")).toBe('<span style="font-size:calc(1em + 10px)">a</span>');
    expect(html("{size=-4}a{/size}")).toBe('<span style="font-size:calc(1em - 4px)">a</span>');
    expect(html("{size=*1.5}a{/size}")).toBe('<span style="font-size:1.5em">a</span>');
  });

  it("nests tags and closes ones left open", () => {
    expect(html("{b}a {i}b{/i}{/b}")).toBe("<b>a <i>b</i></b>");
    expect(html("{b}never closed")).toBe("<b>never closed</b>");
    expect(html("{b}a {i}b{/b} c")).toBe("<b>a <i>b</i></b> c");
  });

  it("drops self-closing and unknown tags but keeps their text", () => {
    expect(html("Wait{w=0.5} for it{nw}{fast}")).toBe("Wait for it");
    expect(html("{cps=20}slow{/cps} {font=x.ttf}f{/font}")).toBe("slow f");
  });

  it("handles escaped braces, escape sequences and a tag cut off by the typewriter", () => {
    expect(html("{{not a tag}}")).toBe("{not a tag}");
    expect(html('Line one\\nLine \\"two\\"')).toBe('Line one<br/>Line &quot;two&quot;');
    expect(html("Hello {col")).toBe("Hello ");
  });

  it("returns nothing for empty text", () => {
    expect(html("")).toBe("");
  });
});
