-- geminesx storage schema. Idempotent: safe to run on every deploy.
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