/**
 * The request body, read exactly once and memoised per Request.
 *
 * `peekModel` used to read `req.clone().text()` and leave the original for the
 * handler to read again. That double read deadlocks on Vercel's Node runtime:
 * every POST /v1/* route hung for the full 300 s invocation timeout and
 * returned zero bytes, while the same bundle on Bun and on a local Node
 * server answered in milliseconds. Buffering once here removes the clone
 * entirely — the router's model peek and the handler's own parse share one
 * read, whichever order they run in.
 *
 * It is also what makes key rotation safe: `execute()` may replay a request
 * against the next key, and a stream can only be consumed once.
 */

const cache = new WeakMap<Request, Promise<string>>();

/** The full request body as text, read once per request. */
export function bodyText(req: Request): Promise<string> {
  let pending = cache.get(req);
  if (!pending) {
    pending = req.text();
    cache.set(req, pending);
  }
  return pending;
}

/** The request body parsed as JSON, or `undefined` when it is not JSON. */
export async function bodyJson<T>(req: Request): Promise<T | undefined> {
  try {
    return JSON.parse(await bodyText(req)) as T;
  } catch {
    return undefined;
  }
}
