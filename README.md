# Day's Run

Unofficial, fan-made live statistics for the Golden Globe Race 2026. Not affiliated with the race.
Live at https://daysrun.vercel.app (private preview while it is being built).
Positions: YB Tracking (with permission). Weather: Open-Meteo, CC BY 4.0.

Nothing on this site may be relayed to a competitor (NOR F.8.2).

Licence: the code is Apache-2.0 (see `LICENSE`). That licence covers the code only. The race data in
`worker/tests/fixtures/` comes from YB Tracking, is used here with permission, and is not ours to license.

- `worker/` — Python worker: fetch YB, decode, derive statistics into Supabase, ping the site.
- `db/` — Postgres migrations.
- `site/` — Next.js site (Vercel): Fleet (sortable ranking, race chart), Skippers, Ghost race, Records, Course & sprints, Performance, Boats, Conditions, Method, and a 1920×1080 broadcast board at `/board`.


Day-to-day operation: the Runbook below.

## Runbook

- **Where things run:** the worker is the GitHub Actions workflow `worker` in this repo (main run 12 min after each 4-hour report, a catch-up run at :40 every hour that captures late fixes and derives any report the main run had to skip, manual runs from the Actions tab or `gh workflow run worker.yml -f command=all`); database and raw-snapshot archive on Supabase (project `DaysRun`, bucket `raw-snapshots`); site on Vercel (project `daysrun`, https://daysrun.vercel.app).
- **A run failed:** open the run in the Actions tab (or `gh run list --workflow worker.yml` and `gh run view <id> --log`). YB down → the run retries both hosts three times and exits; the next run catches up every missing slot. Supabase down → nothing is written; re-run with `gh workflow run worker.yml -f command=all`. A scheduled run that slipped or was skipped by GitHub needs nothing: `all` derives every slot since the last one stored.
- **The schedule stopped by itself:** GitHub disables scheduled workflows in a public repo after 60 days without repository activity (it e-mails a warning first). The race runs for eight months or more, so this will come up once the build goes quiet. Any push resets the clock; `gh workflow enable worker.yml` turns it back on. Check `gh workflow list` once a month. A stop of more than a few days loses track resolution for good, because YB thins its archive.
- **A number looks wrong:** `python -m ggrstats.run verify --as-of <ISO>` against the golden file for 2026-09-16; for another time, recompute with `derive --as-of <ISO>` and read the Method page for the definition.
- **A boat retires or changes class:** YB's `status` field arrives in RaceSetup; the worker stores it on `team.status`. Retired boats stay in `boat_stat` and pages (design plan §4); if YB adds a Chichester tag, teams carry `tags`, extend `upsert_teams` and the ranking filter.
- **A new migration:** apply it by hand BEFORE pushing worker code that needs it — `psql "$DATABASE_URL" -f db/migrations/000N_name.sql` (the workflow does not run migrations) — then re-derive history so old snapshots get the new columns.
- **Re-derive history** after a logic fix: `python -m ggrstats.run derive --since 2026-09-06T12:30:00Z`.
- **Deploy the site:** `cd site && npx vercel deploy --prod --yes`. **Deploy the worker:** `git push` — the next scheduled run uses the new code.
- **Local development:** `worker/`: `python3 -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"`, then `createdb ggrstats_test` and `DATABASE_URL_TEST=postgresql://localhost:5432/ggrstats_test pytest -q` (the database tests refuse any Supabase URL: they truncate every table). `site/`: copy `.env.example` to `.env.local`, `npm run dev`, `npm test`, `npm run build` (every page must be listed as static; only `/api/revalidate` is dynamic).
- **Database connection:** always Supabase's **Session pooler** string (port 5432). The direct host is IPv6-only and GitHub's runners are IPv4-only; the transaction pooler (6543) breaks prepared statements.
- **Weather gaps:** Open-Meteo is a free service and a call can time out. The worker logs it, carries on, and retries that report on its next run; the site shows a boat's most recent model values from the last 12 hours, marked †.
- **A report nobody has sent yet:** if a run starts before YB has published the report, the slot is skipped (`no boat has reported for this slot yet`) and the next hourly run derives it.
- **Secrets:** GitHub Actions secrets for the worker (`gh secret list`); Vercel env for the site; `worker/.env` locally, git-ignored; nothing in git. The repo is public.
- **Going public:** delete `site/proxy.ts` (or set its matcher to `/api/never`) and redeploy. The address stays https://daysrun.vercel.app.
