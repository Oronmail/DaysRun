-- db/migrations/0002_perf.sql — the angles YB does not show (2026-09-17). Apply with psql after 0001_init.sql; safe to re-run.
alter table boat_stat add column if not exists gain24_nm double precision;   -- miles gained (+) on the leader in 24 h, fix to fix
alter table boat_stat add column if not exists vs_near_nm double precision;  -- 24-hour run minus the median of boats within 150 nm
alter table boat_stat add column if not exists near_n int;
alter table boat_stat add column if not exists lever_nm double precision;    -- distance off the leader's track
alter table boat_stat add column if not exists lever_dir text;               -- and the compass side: N, NE, E, SE, S, SW, W, NW

create table if not exists boat_perf (
  race_key text not null, team_id int not null, as_of timestamptz not null,
  wind_ratio double precision, wind_legs int, pos_json jsonb,
  sd7 double precision, share5_7 double precision, parked_h7 int,
  night_delta double precision, n_night int, n_day int, legs int,
  primary key (race_key, team_id, as_of), foreign key (race_key, team_id) references team(race_key, id));

revoke all on boat_perf from anon, authenticated;
grant select on boat_perf to anon, authenticated;
alter table boat_perf enable row level security;
drop policy if exists public_read on boat_perf;
create policy public_read on boat_perf for select to anon, authenticated using (true);

-- One row per boat per day (the 0000 UTC snapshot) for the race chart, so that a whole race stays a small read.
-- security_invoker: the view checks the caller's rights on boat_stat, not the owner's.
create or replace view daily_place with (security_invoker = true) as
  select race_key, team_id, as_of, rank, gap_nm, stale from boat_stat
  where extract(hour from as_of at time zone 'UTC') = 0 and extract(minute from as_of at time zone 'UTC') = 0;
grant select on daily_place to anon, authenticated;
