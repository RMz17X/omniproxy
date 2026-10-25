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
import { AUDIT_HTML } from "../src/audit-ui.ts";
import { SETTINGS_HTML } from "../src/settings-ui.ts";
import { USAGE_HTML } from "../src/usage-ui.ts";
import { STATS_HTML } from "../src/stats-ui.ts";
import { PROVIDERS_HTML } from "../src/providers-ui.ts";
import { KEY_DETAIL_HTML } from "../src/keys-ui.ts";

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

  test("console pages never call the raw-key route", () => {
    for (const [name, html] of [
      ["keys", KEYS_HTML],
      ["key detail", KEY_DETAIL_HTML],
    ] as const) {
      expect(html, `${name} has no raw route call`).not.toContain("/raw");
      expect(html, `${name} has no reveal flag`).not.toContain("reveal=1");
    }
    expect(KEYS_HTML, "keys page brands the copy as masked").toContain("Copy the masked key");
    expect(KEY_DETAIL_HTML, "key detail is masked only").toContain("masked only");
  });

  test("providerPool never collapses a provider to gemini", () => {
    expect(CLIENT_JS).not.toContain('provider === "elevenlabs" ? "elevenlabs" : "gemini"');
    expect(CLIENT_JS).toContain('var p = provider || "custom"');
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
      ["key detail", KEY_DETAIL_HTML],
      ["providers", PROVIDERS_HTML],
      ["statistics", STATS_HTML],
      ["logs", USAGE_HTML],
      ["settings", SETTINGS_HTML],
      ["audit", AUDIT_HTML],
    ] as const) {
      const scripts = inlineScripts(html);
      expect(scripts.length, `${name} ships scripts`).toBeGreaterThan(0);
      for (const s of scripts) {
        expect(() => new Function(s), `${name} script parses`).not.toThrow();
      }
      // The head guard and the page script both have to survive.
      expect(html, `${name} defines GX`).toContain("var GX = {");
      expect(html, `${name} has the auth guard`).toContain("omniproxy.admin.token");
    }
  });
});

function LOGIN_JS_HAS_FORM(html: string): boolean {
  return html.includes('id="gateForm"') && html.includes('id="token"');
}

describe("duration formatting", () => {
  /** Pull one named function out of the GX literal so it can be run directly.
      The client runtime touches the DOM on load, so it cannot be evaluated
      whole; this is the only way to exercise a pure helper inside it. */
  function grab(source: string, head: string): string {
    const at = source.indexOf(head);
    expect(at, `${head} is present`).toBeGreaterThan(-1);
    const open = source.indexOf("{", at);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") {
        depth--;
        if (depth === 0) return source.slice(open, i + 1);
      }
    }
    throw new Error(`unbalanced braces after ${head}`);
  }

  const left = new Function(`return function (ms) ${grab(CLIENT_JS, "left: function")};`)() as (
    ms: number | null | undefined,
  ) => string;

  test("a key parked for good reads as permanent, not as 285,619 years", () => {
    // pool.ts parks a dead or invalidated key at Number.MAX_SAFE_INTEGER, and
    // the view reports cooldownLeftMs as that deadline minus now. The old
    // formatter divided it into years and printed the nonsense.
    expect(left(Number.MAX_SAFE_INTEGER)).toBe("permanent");
    expect(left(Number.MAX_SAFE_INTEGER - Date.now())).toBe("permanent");
    expect(left(9e15)).toBe("permanent");
    expect(left(1e14 + 1)).toBe("permanent");
  });

  test("real cooldowns are still formatted as durations", () => {
    expect(left(0)).toBe("now");
    expect(left(-5)).toBe("now");
    expect(left(45_000)).toBe("45s");
    expect(left(90_000)).toBe("1m 30s");
    expect(left(3 * 3_600_000)).toBe("3h 0m");
    expect(left(2 * 86_400_000)).toBe("2d 0h");
    expect(left(400 * 86_400_000)).toBe("1y");
  });

  test("absent or broken input never reaches the year branch", () => {
    expect(left(null)).toBe("-");
    expect(left(undefined)).toBe("-");
    expect(left(NaN)).toBe("-");
    expect(left(Infinity)).toBe("-");
    expect(left(-Infinity)).toBe("-");
  });
});
