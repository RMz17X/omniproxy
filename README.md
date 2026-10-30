# OmniProxy

> **Deprecated name:** This project was formerly developed under the
> working name "GeminesX" (`geminesx`). That name was deprecated on
> 2026-10-30 in favour of the single canonical name **OmniProxy**; the
> canonical checkout path is `/workspaces/OmniProxy`. Do not use the old
> name for new paths, scripts, configs, or docs. Mentions of it under
> `docs/briefs/` and `docs/audits/` are historical records only.
>
Hono + Bun gateway that fronts pools of API keys from several providers —
Gemini, ElevenLabs, WhatsToken, and any OpenAI-compatible upstream an operator
plugs in. Deploys to Vercel (Node runtime: `vercel.json` uses `@vercel/node` on the esbuild bundle in `api/index.js`) or runs as a plain Bun process.
Rotates on quota exhaustion, parks dead keys, and speaks native Gemini,
OpenAI chat/speech/embeddings/images, and the ElevenLabs dialect.

## Why this exists

Free-tier Gemini keys are limited per project (~15 RPM, daily caps). Stacking
keys behind one endpoint multiplies the ceiling, but only if the gateway knows
which key is cooling and which is dead. This one does, and it keeps the state
either in process memory or in Postgres so multiple Vercel instances agree.

## Providers

Every upstream is a registry entry with four properties: a base URL, the wire
dialect it speaks (`openai` / `gemini` / `elevenlabs`), the capabilities it
offers (`llm` / `tts` / `image` / `video` / `embeddings`), and a regex that
recognises its keys.

| Provider | Wire | Capabilities | Keys |
|---|---|---|---|
| Gemini | gemini | llm, tts, image, embeddings | `AIza…` |
| ElevenLabs | elevenlabs | tts | `sk_<hex>` |
| WhatsToken | openai | llm | `sk-…` |
| custom | openai | operator's choice | operator's pattern |

WhatsToken is deliberately scoped: the gateway hosts a hundred models, this
deployment fronts it for the DeepSeek family only (`deepseek-v4.1-flash-1017`
and its siblings), so both its capability set and its declared model list say
so. Adding a model to the list at `/pengatur/providers` widens what is
advertised; the capability set decides which routes may reach it at all.

* A model name resolves to a provider in this order: an explicit
  `provider/model` prefix, the ElevenLabs naming convention, a `gemini*` name,
  a provider whose catalog lists the id (declared models plus a live
  `/v1/models` cache, refreshed every 10 minutes), then Gemini by default.
* A route requires its capability: a `tts`-only provider is refused on
  `/v1/chat/completions` with a message naming the providers that do serve it.
* Keys are matched to a provider by format on intake, so `POST /pengatur/keys`
  with a bare key list sorts itself. `<PROVIDER>_API_KEYS` env vars seed each
  pool at boot (`GEMINI_API_KEYS`, `ELEVENLABS_API_KEYS`, `WHATSTOKEN_API_KEYS`,
  and the same shape for any registered custom provider).
* Providers are managed at `/pengatur/providers` (console) or
  `POST/PATCH/DELETE /pengatur/providers` (API). Builtins accept only the
  enabled flag and a model list; customs accept everything and can import their
  model list from the upstream's `/v1/models`.

## Surfaces

| Route | Dialect | Notes |
|---|---|---|
| `ANY /v1beta/models/*` | native Gemini | Verbatim passthrough. Streaming, TTS, embeddings, everything. |
| `POST /v1/chat/completions` | OpenAI | Text, `stream: true` (SSE re-framed), `max_tokens`, `stop`, `temperature`. |
| `POST /v1/audio/speech` | OpenAI | Gemini or gateway TTS. `voice` maps OpenAI names → Gemini voices. |
| `POST /v1/embeddings` | OpenAI | Gemini embeddings or a gateway's `/v1/embeddings`. |
| `POST /v1/images/generations` | OpenAI | Image models on OpenAI-wire providers; Gemini's image models stay on the chat route. |
| `GET /v1/models` | OpenAI | Union of every provider's catalog; gateway rows are prefixed `provider/model`. |
| `GET /` | JSON | Anonymous liveness only: `{ok, service}`. The full pool snapshot lives behind the admin token at `/pengatur/status`. |
| `GET /health` | JSON | 200 when at least one key is ready, 503 otherwise. |
| `POST/DELETE /pengatur/keys`, `GET /pengatur/keys/list` | JSON | Add, list (masked), remove keys. Requires `ADMIN_TOKEN`. (There is no `/admin/*` route; raw keys are never sent to the browser.) |

Search grounding is available on the OpenAI route with `"search": true` (or
`web_search: true`); it routes to `SEARCH_MODEL` with `tools: [{google_search:{}}]`.

## Rotation model

Each key record tracks `failures`, `invalid`, `cooldownUntil`, `lastUsed`.

Selection picks the **lowest failure count, then least-recently-used** key that
is not cooling and not inside its pacing window: a key whose `lastUsed` is
within `KEY_RATE_WINDOW_MS` (default 4000 ms, the 15 RPM ceiling) is not
selectable at all, not merely deprioritised by LRU.

Classification on the response:

| Upstream | Action |
|---|---|
| `2xx` / `3xx` | Return untouched (streams included). |
| `429` | Park key for `max(KEY_COOLDOWN_MS, Retry-After)`, retry with next key. |
| `401` / `403` + invalid-key text | Mark key permanently invalid, retry. |
| `401` without invalid-key text | Park key briefly, retry with next key. A bare 401 is not proof the credential is dead. |
| `403` (ElevenLabs) without invalid-key wording | Not a dead credential (often a permission/voice restriction) — do not retire. |
| `403` + quota text | Treat as 429. |
| `403` other | Real auth failure for the caller — pass through, do not rotate. |
| `400` + `API_KEY_INVALID` | Mark invalid, retry. |
| `400` other | Client error — pass through, do not rotate. |
| `5xx` | Park key briefly, retry. |
| network error | Park key briefly, retry. |

A request is only retried while keys remain untried and `MAX_ATTEMPTS` is not
exhausted. If the whole pool is cooling, the gateway waits up to `MAX_WAIT_MS`
for the soonest key to recover before returning a `429 pool_exhausted`.

## State store

* `DATABASE_URL` set → key identities, health and the usage ledger live in
  Postgres (Neon HTTP driver), so every instance shares one pool.
* Otherwise → process-local map and a memory-only ledger. Fine for one
  container, wrong for serverless with more than one warm instance, and usage
  rows are lost on redeploy.

## Deploy

### Vercel

```bash
bunx vercel link
bunx vercel env add ADMIN_TOKEN production
bunx vercel env add CLIENT_TOKEN production
bunx vercel env add GEMINI_API_KEYS production
bunx vercel env add ELEVENLABS_API_KEYS production
bunx vercel env add WHATSTOKEN_API_KEYS production
bunx vercel env add DATABASE_URL production
bunx vercel env add ROLLUP_TOKEN production
bunx vercel --prod
```

`vercel.json` defines one daily cron, `0 19 * * *` (02:00 WIB), calling
`GET /internal/rollup` (Vercel cron issues GET; the handler is `app.all`, so
a manual POST works too). The route accepts `Authorization: Bearer
$ROLLUP_TOKEN` or `Bearer $CRON_SECRET` (or `X-Rollup-Token`); with neither
token set it returns 403.
Each run recomputes yesterday's `usage_daily` buckets from `usage_events` and
then prunes events older than `RETENTION_DAYS`.

## Ledger and rollup

The gateway writes one `usage_events` row per request (identifiers, counts,
timings, status only — never a prompt or completion). Writes are batched:
`LEDGER_MAX_ROWS` rows or `LEDGER_FLUSH_MS` milliseconds, whichever comes first,
and a database failure degrades to the in-memory tail instead of failing the
request. The console tail keeps `LEDGER_TAIL_ROWS` rows.

### Plain Bun

```bash
bun install
cp .env.example .env   # fill GEMINI_API_KEYS
bun run start
```

## Usage

```bash
# OpenAI SDK
curl -s http://localhost:3000/v1/chat/completions \
  -H 'authorization: Bearer $CLIENT_TOKEN' \
  -H 'content-type: application/json' \
  -d '{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"hi"}]}'

# TTS
curl -s http://localhost:3000/v1/audio/speech \
  -H 'authorization: Bearer $CLIENT_TOKEN' \
  -H 'content-type: application/json' \
  -d '{"input":"halo dunia","voice":"nova"}' -o out.wav

# Chat through the WhatsToken gateway — bare id or provider/model prefix
curl -s http://localhost:3000/v1/chat/completions \
  -H 'authorization: Bearer $CLIENT_TOKEN' \
  -H 'content-type: application/json' \
  -d '{"model":"deepseek-v4.1-flash-1017","messages":[{"role":"user","content":"hi"}]}'

# Add keys at runtime (provider auto-detected from the key format)
curl -s http://localhost:3000/pengatur/keys \
  -H 'authorization: Bearer $ADMIN_TOKEN' \
  -H 'content-type: application/json' \
  -d '{"keys":["AIza...","AIza..."]}'

# Register a custom OpenAI-compatible provider
curl -s http://localhost:3000/pengatur/providers \
  -H 'authorization: Bearer $ADMIN_TOKEN' \
  -H 'content-type: application/json' \
  -d '{"id":"mygw","label":"My Gateway","baseUrl":"https://gw.example.com/v1","capabilities":["llm","embeddings"],"keyPattern":"^mg-","models":["my-model-1"]}'
```

Point the OpenAI SDK at `base_url: http://localhost:3000/v1` and it works
unchanged; the dummy `api_key` the SDK insists on is accepted because the
gateway only checks `CLIENT_TOKEN` when that variable is set, and never
forwards the inbound credential upstream.

## Console

The operator console lives under `/pengatur`. The pages are public shells:
the browser asks for the admin token once, keeps it in `localStorage`, and
sends it as a bearer token on every data call. No raw key is ever sent to the
browser, only its masked form and its sha256 id.

| Page | What it shows |
|---|---|
| `/pengatur` | Pool health, plan breakdown, live probe, key intake |
| `/pengatur/logs` | Request ledger with filters, breakdowns and CSV export |
| `/pengatur/stats` | Range statistics, hour by weekday heatmap, cost projection |
| `/pengatur/keys` | Every pooled key: plan, health, bulk plan change, probe, remove |
| `/pengatur/keys/:id` | One key: counters, daily requests, cooldown timeline |
| `/pengatur/models` | Live model inventory, pricing and a per model probe |
| `/pengatur/providers` | Provider registry: capabilities, keys, models, enable/disable, import |
| `/pengatur/settings` | Effective configuration, read only |
| `/pengatur/audit` | Trail of admin actions |

The whole console is one design system in `src/ui.ts`: one stylesheet, one
shell, one client runtime. See `docs/briefs/f5-console-redesign.md` for the
rules every page follows.

## Tests

`test/mock-upstream.ts` is a fake Gemini that misbehaves on demand: a key
containing `429` always rate limits, `dead` always returns `API_KEY_INVALID`,
`boom` returns 500, everything else succeeds.

```bash
bun test
```

The suite boots its own mock upstream on an OS-assigned port (the harness
reads the port from the mock's stdout); do not run the mock by hand on a
fixed port — a stale mock on that port would answer the suite with old code.

Verified behaviour against that mock: healthy chat completion, streaming SSE
re-framed into OpenAI chunks with `[DONE]`, WAV header emitted for TTS,
cooldown recorded for the 429 key, invalid key marked dead and excluded from rotation, and an
all-bad pool returning `429 pool_exhausted` instead of a false 200.
