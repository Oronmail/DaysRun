# Day's Run

Unofficial statistics for the Golden Globe Race 2026, built by a GGR-enthusiast skipper. Not affiliated with the race or its organisers.

The race tracker shows where each boat is. Day's Run works on the history behind the positions: runs over 4 hours, 24 hours and 7 days, places gained and lost, the gap to the ghosts of past editions, speed for the wind each boat has, points of sail, records, sprints, and the conditions at every boat.

Live at https://daysrun.net (a private preview while it is being built).
Positions: YB Tracking. Weather: Open-Meteo, CC BY 4.0. To follow the boats live, use the race's own tracker: https://goldengloberace.com/live-tracker/

Nothing on this site may be relayed to a competitor (NOR F.8.2).

Licence: the code is Apache-2.0 (see `LICENSE`). That licence covers the code only. The race data in `worker/tests/fixtures/` comes from YB Tracking and is not ours to license.

- `worker/` — Python worker: fetch YB, decode, derive the statistics into Supabase, ping the site. Runs on GitHub Actions.
- `db/` — Postgres migrations.
- `site/` — Next.js site (Vercel): Fleet (sortable ranking, race chart), Skippers, Ghost race, Records, Course & sprints, Performance, Boats, Conditions, Method, and a 1920×1080 broadcast board at `/board`.

## How it runs

The worker runs on GitHub Actions a few minutes after each 4-hour position report and once an hour in between. It stores the decoded positions and every derived statistic in Supabase Postgres, keeps the raw snapshots in Supabase Storage, and pings the site to re-render. The site is statically rendered Next.js on Vercel; nothing in a visitor's browser talks to the tracker or the database.

To work on it: `worker/` — `pip install -e ".[dev]"` and `pytest`; `site/` — copy `.env.example` to `.env.local`, then `npm run dev`, `npm test`, `npm run build`.
