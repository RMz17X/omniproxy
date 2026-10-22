/**
 * The client runtime and every page script are JS source that happens to live
 * inside TypeScript template literals. tsc cannot see inside those strings, so
 * a TypeScript annotation typed there is a runtime syntax error that silently
 * kills the whole block: `GX is not defined` on every console page.
 *
 * These tests parse each shipped script with a real JS parser and fail on any
 * TS-only syntax.
 */
import { describe, expect, test } from "bun:test";
import { CLIENT_JS, LOGIN_HTML } from "../src/ui.ts";
import { ADMIN_HTML } from "../src/admin-ui.ts";
import { MODELS_HTML } from "../src/models-ui.ts";
import { KEYS_HTML } from "../src/keys-ui.ts";

/** Every inline <script> body in a rendered page, in document order. */
function inlineScripts(html: string): string[] {
  const out: string[] = [];
  const re = /<script>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[1]);
  return out;
}

describe("shipped client scripts", () => {
  test("CLIENT_JS parses as JavaScript", () => {
    expect(() => new Function(CLIENT_JS)).not.toThrow();
  });

  test("no TypeScript-only syntax leaks into a template literal", () => {
    // Annotations after a parameter list, and `as` casts, are the two forms
    // that have actually shipped broken here.
    expect(CLIENT_JS).not.toMatch(/function\s*\([^)]*:\s*[A-Za-z]/);
    expect(CLIENT_JS).not.toMatch(/\)\s*as\s+[A-Za-z]/);
  });

  test("GX is actually defined by the runtime block", () => {
    expect(CLIENT_JS).toContain("var GX = {");
  });

  test("the login page ships a working gate script", () => {
    const scripts = inlineScripts(LOGIN_HTML);
    expect(scripts.length).toBeGreaterThan(0);
    for (const s of scripts) expect(() => new Function(s)).not.toThrow();
    expect(LOGIN_JS_HAS_FORM(LOGIN_HTML)).toBe(true);
  });

  test("every console page's scripts parse as JavaScript", () => {
    for (const [name, html] of [
      ["overview", ADMIN_HTML],
      ["models", MODELS_HTML],
      ["keys", KEYS_HTML],
    ] as const) {
      const scripts = inlineScripts(html);
      expect(scripts.length, `${name} ships scripts`).toBeGreaterThan(0);
      for (const s of scripts) {
        expect(() => new Function(s), `${name} script parses`).not.toThrow();
      }
      // The head guard and the page script both have to survive.
      expect(html, `${name} defines GX`).toContain("var GX = {");
      expect(html, `${name} has the auth guard`).toContain("geminesx.admin.token");
    }
  });
});

function LOGIN_JS_HAS_FORM(html: string): boolean {
  return html.includes('id="gateForm"') && html.includes('id="token"');
}
