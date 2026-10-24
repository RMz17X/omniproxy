# PRD - OmniProxy

Status: draft untuk implementasi
Basis: fork dari `gemini-key-rotator` (GKR), commit `6a70cce`
Repo: `origin` github.com/RMz17X/omniproxy (private), `backup` gitlab.com/hijilabs/omniproxy (private)
Default branch: `master`
Domain: `omniproxy.vercel.app`
Region fungsi Vercel: `sin1`

## 1. Ringkasan

OmniProxy adalah gateway OpenAI-compatible plus operator console untuk pool API key
Gemini. Tiga perubahan dibanding induknya:

1. Brand dan prefix konsisten jadi `omniproxy` di seluruh permukaan.
2. Storage pindah dari Upstash Redis (REST) ke Neon Postgres.
3. Console diperluas: request logs, statistik, identitas per key, TTS studio,
   settings, dan audit admin.

Gateway-nya sendiri bekerja seperti GKR: satu endpoint OpenAI-compatible di depan
pool key, rotasi saat 429/5xx, cooldown per key, model catalog live, dan console
operator di path `/pengatur`.

## 2. Non-goals v1

- Akun pengguna, billing multi-tenant, kuota per pelanggan.
- Multi-region Vercel. Hobby hanya boleh satu region fungsi.
- Live logs dengan polling ke database.
- Cron keep-alive.
- Message queue atau worker proses terpisah.

## 3. Batasan platform yang mengikat desain

Fakta Neon free plan (docs, terverifikasi):

- 100 CU-hours per project per bulan, kira-kira 0.25 CU jalan 400 jam.
- Scale to zero setelah 5 menit idle, tidak bisa dimatikan.
- 1 GB storage per project, 20 GB total per akun.
- 5 GB public network transfer per project per bulan.
- CU-hours atau network transfer habis: compute di-suspend sampai periode billing
  berikutnya. Koneksi lama putus, koneksi baru tidak bisa dibuka.
- Storage lewat 1 GB: INSERT/UPDATE/DELETE yang menambah storage gagal, bukan
  ditagih overage.
- Project free plan yang idle 90 hari atau lebih berpotensi dihapus.

Fakta Vercel Hobby: satu region fungsi, cron maksimum sekali sehari.

Region Neon yang tersedia tidak termasuk India. Yang dipakai: `aws-ap-southeast-1`
(Singapore), satu region fisik dengan Vercel `sin1`, RTT 1 sampai 3 ms.

### Aturan keras turunan

- **R1.** Tidak ada query Neon di critical path request gateway.
- **R2.** Tidak ada polling Neon dari browser.
- **R3.** Console tidak pernah scan tabel raw.
- **R4.** Tidak ada cron keep-alive. Biarkan database tidur.
- **R5.** Retensi raw 30 hari. Rollup disimpan permanen.

Dasar R2: polling tiap 3 detik selama 8 jam sehari berarti compute tidak pernah
tidur, 24 jam x 30 hari x 0.25 CU = 180 CU-hours terhadap jatah 100. Compute
suspend sekitar tanggal 18 dan console mati total sampai bulan berikutnya.

## 4. Arsitektur

Tiga lapis.

**Lapis 0, memori per instance.** Pool state yang dibaca tiap request: cooldown,
failures, lastUsed, pacing window, tier, enabled. Dimuat sekali saat cold start
dari `SELECT id, plan, enabled, label FROM keys` (satu round trip), lalu nol
latency tambahan untuk request berikutnya. Ring buffer tail logs juga di sini.

**Lapis 1, write-behind.** Baris telemetri masuk buffer memori, dikirim setelah
response lewat `waitUntil` sebagai satu multi-row INSERT. Gagal kirim berarti
baris telemetri hilang, request pengguna tidak pernah gagal karena ini.

**Lapis 2, Neon Postgres.** Sumber kebenaran: `keys`, `usage_events`,
`usage_daily`, `admin_audit`. Dibaca console (QPS rendah) dan job rollup.

Driver: `@neondatabase/serverless`. Setiap query adalah satu `fetch`, bukan
koneksi TCP. Tidak ada pool, tidak ada PgBouncer, tidak ada batas
`max_connections`, tidak ada ledakan koneksi dari lambda konkuren.

Trade-off yang diterima begitu saja: konsistensi cooldown antar instance bersifat
eventual. Instance A yang tahu key kena 429 tidak langsung memberitahu instance B.
Biaya nyatanya beberapa 429 tambahan, dan itu sudah ditangani jalur cooldown lokal.

## 5. Skema

```sql
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
```

Tanpa partisi, disengaja. Partisi menambah DDL berkala dan satu job yang bisa
gagal; retensi `DELETE` di job rollup sudah cukup. Raw 30 hari kira-kira 60 MB,
rollup sekitar 1 MB per bulan. Jauh di bawah 1 GB.

Body prompt tidak pernah masuk kolom mana pun.

## 6. Modul

Baru:

- `src/db.ts` - klien Neon, helper query dengan timeout dan breaker.
- `src/schema.sql` - DDL di atas.
- `src/keys-repo.ts` - baca/tulis identitas key.
- `src/ledger.ts` - ring buffer, batch writer, tail untuk live view.
- `src/rollup.ts` - agregasi harian, hitung p50/p95, retensi.
- `src/audit.ts` - catatan aksi admin.
- `src/voices.ts` - katalog voice TTS, konstanta di kode.
- `src/tts.ts` - pemanggilan TTS dan cache preview.
- Shell UI baru: `logs-ui.ts`, `stats-ui.ts`, `keys-ui.ts`, `settings-ui.ts`,
  `audit-ui.ts`, `tts-ui.ts`.

Berubah berat:

- `src/pool.ts` - cabut Upstash, memory mirror plus reconcile dari `keys`.
- `src/config.ts` - env baru, `DATABASE_URL` opsional.
- `src/app.ts` - route baru, prefix header dan log konsisten.
- `src/usage.ts` - diserap ke `ledger.ts`.

Tidak disentuh: `src/gemini.ts`, `src/openai.ts`, `src/upstream.ts`,
`src/probe.ts`, `src/models.ts`, `src/models-catalog.ts` selain string brand.

## 7. Halaman console

Path Indonesia dipertahankan. Itu aset obscurity, bukan utang.

1. `/pengatur` - Overview. KPI 24 jam dari rollup, top model, top key, lima error
   terakhir dari ring memori, status pool.
2. `/pengatur/logs` - Request logs. Tail dari ring memori, filter rentang/route/
   model/key/status, drawer detail tanpa body prompt, export CSV keyset.
3. `/pengatur/stats` - Statistik. Rentang 1h/24h/7d/30d, breakdown model, key,
   route, status code, heatmap jam x hari, p50/p95, proyeksi cost bulanan.
4. `/pengatur/keys` - Daftar key plus identitas. Bulk set tier, enable/disable,
   test satu, test semua, tambah, soft delete.
5. `/pengatur/keys/[id]` - Detail key. Grafik harian, 100 request terakhir,
   timeline cooldown.
6. `/pengatur/models` - Inventory model, harga per 1M token, badge free tier,
   badge kapabilitas, tombol test terukur.
7. `/pengatur/tts` - TTS studio. Pilih model dan voice, preview ter-cache, style
   prompt, format output, riwayat generate.
8. `/pengatur/settings` - Rotate token, default model/voice, parameter cooldown,
   info region, export/import config.
9. `/pengatur/audit` - Audit admin.

Plus `/favicon.svg`, `/favicon.ico`, `/health`.

## 8. Rename map

13 file sumber mengandung `gkr`:

`src/openai.ts` (6), `src/gemini.ts` (6), `test/env.ts` (5), `src/pool.ts` (4),
`scripts/sync-hajimi.ts` (4), `src/models-ui.ts` (3), `src/usage-ui.ts` (2),
`src/app.ts` (2), `test/probe.test.ts` (1), `src/index.ts` (1),
`src/admin-ui.ts` (1), `serverless/index.ts` (1), `README.md` (1).

`gemini-key-rotator` muncul di: `package.json`, `package-lock.json`,
`src/app.ts` (2, termasuk `service: "gemini-key-rotator"`), `README.md`,
`scripts/sync-hajimi.ts`.

`api/index.js` adalah artifact esbuild dari `serverless/index.ts`. Tidak diedit
tangan, cukup regenerate lewat `bun run bundle:api`.

Konsistensi permukaan:

- Header respons: `x-gkr-attempts` jadi `x-omniproxy-attempts`.
- Prefix log: `[gkr]` jadi `[omniproxy]`.
- Nama file CSV: `gkr-usage-<tanggal>.csv` jadi `omniproxy-usage-<tanggal>.csv`.
- Field `service` pada health/metrics jadi `omniproxy`.

## 9. Env

Dibuang: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `REDIS_BREAKER_MS`,
`POOL_CACHE_TTL_MS`.

Ditambah: `DATABASE_URL` (opsional di fase 1), `DB_QUERY_TIMEOUT_MS` (3000),
`LEDGER_FLUSH_MS` (2000), `LEDGER_MAX_ROWS` (200), `LEDGER_TAIL_ROWS` (500),
`RETENTION_DAYS` (30), `ROLLUP_TOKEN`.

Tetap: `GEMINI_API_KEYS`, `GEMINI_BASE_URL`, `ADMIN_TOKEN`, `CLIENT_TOKEN`,
`KEY_COOLDOWN_MS`, `KEY_5XX_COOLDOWN_MS`, `KEY_RATE_WINDOW_MS`, `MAX_ATTEMPTS`,
`MAX_WAIT_MS`, `MODELS_CACHE_MS`, `MODELS_TIMEOUT_MS`, `UPSTREAM_TIMEOUT_MS`,
`PROBE_TIMEOUT_MS`, `PROBE_FALLBACK_MODELS`, `USAGE_ROWS`, `LOG_LEVEL`,
`DEFAULT_MODEL`, `DEFAULT_EMBED_MODEL`, `DEFAULT_TTS_MODEL`, `DEFAULT_VOICE`,
`SEARCH_MODEL`, `PORT`.

## 10. Fase

- **F1** Fork, rename 13 file, regenerate bundle, kerangka modul baru,
  `schema.sql`, `@neondatabase/serverless` masuk dependency. `DATABASE_URL`
  opsional: tanpa itu gateway tetap jalan, pool dari `GEMINI_API_KEYS`, ledger
  hanya memori.
- **F2** Project Neon dibuat di `aws-ap-southeast-1`, schema dijalankan, 228 key
  existing di-import sebagai identitas, `pool.ts` baca dari Neon.
- **F3** `ledger.ts` batch writer plus `rollup.ts` plus cron harian.
- **F4** Console: logs, stats, keys, settings, audit.
- **F5** TTS studio.
- **F6** Project Vercel `omniproxy`, link, deploy, verifikasi routing.

F1 tidak butuh kredensial apa pun.

## 11. Kriteria penerimaan

- `bunx tsc --noEmit` bersih.
- `bun run bundle:api` menghasilkan `api/index.js` tanpa string `gkr`.
- `rg -i gkr` di luar lockfile dan `api/index.js` menghasilkan nol hit.
- Tanpa `DATABASE_URL` gateway tetap melayani `/v1/chat/completions` dan `/health`.
- Semua sembilan path console plus `/health` balas 200 dengan layout benar.
- `/admin` dan `/models` tetap 404.
- Tidak ada body prompt tersimpan di database.
- Key selalu tampil masked di log, metrik, dan console.

## 12. Invarian

- Postur keamanan commit `6a70cce` dipertahankan: `/admin` dan `/models` mati,
  path console tidak diiklankan.
- Tidak ada secret di log.
- Endpoint `/pengatur/keys` butuh bearer admin.
- Endpoint `/internal/rollup` butuh `ROLLUP_TOKEN`.
- Recording dan perilaku jalur upstream Gemini tidak berubah.