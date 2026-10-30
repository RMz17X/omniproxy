-- omniproxy storage schema. Idempotent: safe to run on every deploy.
-- Applied by `bun run db:migrate` (scripts/migrate.ts).
--
-- PRIVACY: no column here can hold prompt or completion body text. Usage rows
-- carry counts, identifiers, status and timings only.

create table if not exists keys (
  id           text primary key,          -- sha256(raw)[:12]
  masked       text not null,
  label        text,
  owner        text,
  plan         text not null default 'unknown',
  tags         text[] not null default '{}',
  enabled      boolean not null default true,
  note         text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  fail_count   int not null default 0
);

-- Durable cooldown. Serverless instances scale to zero, so a 429 park kept only
-- in process memory is lost on every cold start and the key is re-fired
-- immediately. NULL means "ready"; a future timestamp means "parked until".
alter table keys add column if not exists cooldown_until timestamptz;

-- Verdict / plan state. `status` is the last classified probe verdict, kept so
-- a cold start does not re-fire a key the upstream already refused. `plan` is
-- the last *validated* tier (only a 429 body proves it); `plan_evidence` keeps
-- the shape that proved it. `quota_state` is the structured 429 body, so the
-- console can show a reset time without re-probing. `retry_after_at` is the
-- upstream's own deadline, distinct from the local cooldown park.
alter table keys add column if not exists status text not null default 'unknown';
alter table keys add column if not exists plan_evidence jsonb;
alter table keys add column if not exists quota_state jsonb;
alter table keys add column if not exists retry_after_at timestamptz;
-- per-model free-tier refusals: {model: epoch_ms_deadline}. A key out of
-- allowance for one model stays usable for the rest, so this cannot live in
-- `cooldown_until` (pool-wide) or `quota_state` (a verdict about the project).
alter table keys add column if not exists model_refusals jsonb;
alter table keys add column if not exists plan_validated_at timestamptz;
alter table keys add column if not exists last_checked_at timestamptz;
alter table keys add column if not exists last_used timestamptz;
-- Retirement clock. `retired_at` is when the upstream verdict that killed this
-- credential was OBSERVED, not when the row was written: the pool compares it
-- against the observation instant of every later verdict, so a quota or
-- healthy answer issued BEFORE the retirement can never clear it, regardless
-- of which statement reaches Postgres last. `retired_reason` names the verdict
-- that stands. A row retired before this column existed carries NULL and is
-- treated as infinitely old.
alter table keys add column if not exists retired_at timestamptz;
alter table keys add column if not exists retired_reason text;
alter table keys alter column plan set default 'unknown';

-- Provider dimension. Default 'gemini' so existing Gemini keys remain untouched.
alter table keys add column if not exists provider text not null default 'gemini';
create index if not exists keys_provider_status_idx on keys (provider, status);

create table if not exists usage_events (
  ts                timestamptz not null default now(),
  req_id            text,
  route             text not null,
  model             text,
  key_id            text,
  status            int not null,
  attempts          smallint not null default 1,
  rotated           boolean not null default false,
  stream            boolean not null default false,
  prompt_tokens     int not null default 0,
  completion_tokens int not null default 0,
  total_tokens      int not null default 0,
  cost_usd          numeric(12,8),
  latency_ms        int,
  error_code        text
);
create index if not exists usage_events_ts_idx on usage_events (ts desc);
create index if not exists usage_events_key_idx on usage_events (key_id, ts desc);

create table if not exists usage_daily (
  day               date not null,
  route             text not null,
  model             text not null default '',
  key_id            text not null default '',
  requests          int not null default 0,
  errors            int not null default 0,
  rotated           int not null default 0,
  prompt_tokens     bigint not null default 0,
  completion_tokens bigint not null default 0,
  cost_usd          numeric(14,8) not null default 0,
  p50_ms            int,
  p95_ms            int,
  primary key (day, route, model, key_id)
);

create table if not exists admin_audit (
  id     bigserial primary key,
  ts     timestamptz not null default now(),
  actor  text not null,
  action text not null,
  target text,
  detail jsonb
);
create index if not exists admin_audit_ts_idx on admin_audit (ts desc);

-- Raw key material, stored as-is and NOT encrypted. `keys` keeps the masked
-- identity; this table is what makes a key survive a cold start. Anyone who can
-- read this table can read every live API key — the deliberate trade.
create table if not exists key_material (
  id         text primary key,          -- sha256(raw)[:12], joins keys.id
  raw_key    text not null,             -- stored as-is, NOT encrypted
  updated_at timestamptz not null default now()
);

-- Which pool the material belongs to, so a cold start rebuilds the pool with
-- the right provider before the `keys` identity overlay lands.
alter table key_material add column if not exists provider text not null default 'gemini';

-- Operator-tunable gateway settings, one row per knob. The matching env var
-- stays the default; a row here overrides it at runtime, so the console can
-- change a value without a redeploy. Currently holds `max_key_attempts`
-- (how many keys one request may rotate through).
create table if not exists gateway_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- Provider registry. A provider is an upstream the gateway can serve: where
-- its API lives, what it can do (llm / tts / image / video / embeddings),
-- which wire dialect it speaks, and how its keys are shaped. Builtin rows
-- (gemini / elevenlabs) are code-owned: the row only carries
-- operator state (enabled flag, imported model list). Custom rows carry the
-- full definition added through the console.
create table if not exists providers (
  id           text primary key,
  label        text not null,
  base_url     text not null default '',
  capabilities text[] not null default '{}',
  wire         text not null default 'openai',
  key_pattern  text,
  models       text[] not null default '{}',
  enabled      boolean not null default true,
  builtin      boolean not null default false,
  note         text,
  created_at   timestamptz not null default now()
);

-- Client API keys: the credentials end users present on /v1/*.
--
-- Deliberately separate from `keys` (that table is the upstream pool: Gemini /
-- ElevenLabs credentials the gateway spends). A row here is a key an operator
-- mints for a client and can revoke individually, so handing access to one
-- consumer no longer means shipping the deployment-wide CLIENT_TOKEN.
--
-- Only the SHA-256 is stored. The raw value is displayed exactly once, at mint
-- time, and can never be read back from this table.
create table if not exists client_keys (
  id           text primary key,          -- sha256(raw)[:12]
  hash         text not null unique,      -- sha256(raw), full
  prefix       text not null,             -- shown in the console: op_live_xxxxxxxx
  label        text,
  enabled      boolean not null default true,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists client_keys_hash_idx on client_keys (hash);

-- Seed the builtins so a console toggle or an imported model list survives a
-- cold start. `do nothing` on conflict: the code owns the definition, the row
-- only carries operator state, so a redeploy never reverts an edit.
insert into providers (id, label, base_url, capabilities, wire, key_pattern, models, enabled, builtin, note)
values
  ('gemini', 'Gemini', '', array['llm','tts','image','embeddings'], 'gemini', '^AIza[0-9A-Za-z_-]{20,}$', '{}', true, true, 'Google Generative Language. Chat, TTS, image and embeddings.'),
  ('elevenlabs', 'ElevenLabs', '', array['tts'], 'elevenlabs', '^sk_[a-fA-F0-9]{40,64}$', '{}', true, true, 'Text to speech and voices, routed by model name on /v1/audio/speech.')
on conflict (id) do nothing;

-- Demotion: WhatsToken is no longer a protected builtin (the protected
-- defaults are gemini and elevenlabs only). An existing row keeps everything
-- the operator owns — label, base URL, capabilities, models, enabled flag,
-- note — and only loses the builtin flag, so the provider stays routable
-- and becomes deletable (deletion is still refused while pooled keys point
-- at it). Idempotent: re-running it changes nothing once the flag is false.
update providers set builtin = false where id = 'whatstoken';

-- One-time corrections for rows seeded before the host was verified and the
-- scope narrowed to DeepSeek. The URL fix is unconditional; the model list is
-- only restored on a row still carrying the original seed shape (empty list,
-- old capability set) so an operator's own curation is never overwritten.
update providers
   set base_url = 'https://www.whatstoken.ai/v1'
 where id = 'whatstoken'
   and base_url = 'https://api.whatstoken.ai/v1';

update providers
   set capabilities = array['llm'],
       models = array['deepseek-v4.1-flash-1017','deepseek-v4.1-flash-1017-special','deepseek-v4-1-flash','deepseek-v4-flash-ga','deepseek-v4-pro-0813','deepseek-v4-pro-ga-260813'],
       note = 'DeepSeek models through the WhatsToken gateway. Chat only.'
 where id = 'whatstoken'
   and models = '{}'
   and capabilities @> array['llm','tts','image','video'];

-- Which pool served a usage row. Model-derived attribution broke the moment a
-- bare id (gpt-4o, deepseek-v4.1-flash-1017) could route to a non-gemini
-- provider, so the provider is recorded at commit time instead of guessed.
alter table usage_events add column if not exists provider text not null default 'gemini';

-- Same dimension on the rollup. Functionally dependent on key_id in practice
-- (a key belongs to one provider), but explicit so the console never guesses.
-- The bucket key gains the column: the old primary key cannot express it, so
-- the constraint is replaced by a unique index over the five columns. Rows
-- written before this column existed all carry 'gemini', so the new index
-- never collides with existing data.
alter table usage_daily add column if not exists provider text not null default 'gemini';
alter table usage_daily drop constraint if exists usage_daily_pkey;
create unique index if not exists usage_daily_bucket_idx on usage_daily (day, route, model, key_id, provider);
-- Soft delete. `purge-dead` used to DELETE the row and its material, which made
-- a wrong call unrecoverable and left warm instances still showing the key
-- until they recycled. A tombstone fixes both: the row and the raw value stay,
-- every read path ignores them, and clearing the column restores the key.
alter table keys add column if not exists deleted_at timestamptz;
create index if not exists keys_deleted_idx on keys (deleted_at) where deleted_at is not null;
