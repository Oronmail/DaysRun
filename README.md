# Day's Run

Unofficial, fan-made live statistics for the Golden Globe Race 2026. Not affiliated with the race.
Live at https://daysrun.vercel.app (private preview while it is being built).
Positions: YB Tracking (with permission). Weather: Open-Meteo, CC BY 4.0.

Nothing on this site may be relayed to a competitor (NOR F.8.2).

Licence: the code is Apache-2.0 (see `LICENSE`). That licence covers the code only. The race data in
`worker/tests/fixtures/` comes from YB Tracking, is used here with permission, and is not ours to license.

- `worker/` — Python worker: fetch YB, decode, derive statistics into Supabase, ping the site.
- `db/` — Postgres migrations.
- `site/` — Next.js site (Vercel).



