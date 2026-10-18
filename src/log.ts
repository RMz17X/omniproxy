/**
 * Structured JSON logging.
 *
 * Every line is one JSON object so log shippers can index it without parsing
 * prose. Field values are scrubbed of anything that looks like a Google API
 * key or OAuth token as a defence in depth: callers are expected to pass
 * `maskKey()` values, and this is the belt to that suspenders.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;

export type LogLevel = keyof typeof LEVELS;

const threshold: number =
  LEVELS[(process.env.LOG_LEVEL ?? "info") as LogLevel] ?? LEVELS.info;

const KEY_SHAPED = /AIza[0-9A-Za-z_-]{10,}|ya29\.[0-9A-Za-z._-]{10,}/g;

const scrub = (value: unknown): unknown => {
  if (typeof value === "string") return value.replace(KEY_SHAPED, "[redacted]");
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrub(v);
    return out;
  }
  return value;
};

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  if (LEVELS[level] < threshold) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(scrub(fields) as Record<string, unknown>),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
