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
  plan         text not null default 'free',
  tags         text[] not null default '{}',
  enabled      boolean not null default true,
  note         text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  fail_count   int not null default 0
);

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