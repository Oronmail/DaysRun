-- db/migrations/0005_editions.sql — the fleets of past races beside this year's (2026-09-18). independent of 0004; safe to re-run.
-- A boat's race ends at the documented date (never when its tracker falls silent); the columns are empty for 2026 until its first retirement.
alter table team add column if not exists ended_at timestamptz, add column if not exists ended_how text, add column if not exists ended_where text,
  add column if not exists class_note text, add column if not exists source text;

-- One row per race per race day (00:00 UTC of the start date plus N days), the fleet's figures on the 2026 course line.
create table if not exists edition_day (
  race_key text not null, race_day int not null, as_of timestamptz not null,
  racing int not null, finished int not null, fresh int not null,        -- boats in the race; home; with a fix within 20 min of the report
  leader_team_id int, leader_mg_nm double precision, median_mg_nm double precision, last_mg_nm double precision,
  best_run_nm double precision, best_run_team_id int,
  best_sofar_nm double precision, best_sofar_team_id int, best_sofar_at timestamptz,   -- the best 24-hour run of the race so far, and who set it
  mean_run_nm double precision, runs_n int not null default 0,
  wind_kt double precision, wind_legs int not null default 0, legs_upwind int not null default 0, legs_reaching int not null default 0, legs_running int not null default 0,
  straight_pct double precision,                                          -- miles sailed for every 100 made good, the middle boat
  primary key (race_key, race_day));
-- One row per boat per race day.
create table if not exists edition_boat_day (
  race_key text not null, team_id int not null, race_day int not null, as_of timestamptz not null,
  racing boolean not null, finished boolean not null, fresh boolean not null,
  fix_at timestamptz, lat double precision, lon double precision,
  togo_nm double precision, mg_nm double precision, sailed_nm double precision, run24_nm double precision,
  best24_nm double precision, best24_at timestamptz,                      -- the boat's own best 24-hour run so far
  place int,
  primary key (race_key, team_id, race_day), foreign key (race_key, team_id) references team(race_key, id));
create index if not exists edition_boat_day_day on edition_boat_day (race_key, race_day);
-- When each boat passed each milestone (interpolated between fixes), and the race day of it.
create table if not exists edition_milestone (
  race_key text not null, team_id int not null, milestone text not null, passed_at timestamptz not null, race_day int not null,
  primary key (race_key, team_id, milestone), foreign key (race_key, team_id) references team(race_key, id));
-- Model wind at the end of each 4-hour leg of a past race (this year's is in conditions).
create table if not exists edition_wind (
  race_key text not null, team_id int not null, slot_at timestamptz not null, wind_kt double precision, wind_dir_deg double precision, model text,
  primary key (race_key, team_id, slot_at));
do $$ declare t text; begin
  foreach t in array array['edition_day', 'edition_boat_day', 'edition_milestone', 'edition_wind'] loop
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('grant select on %I to anon, authenticated', t);
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists public_read on %I', t);
    execute format('create policy public_read on %I for select to anon, authenticated using (true)', t);
  end loop; end $$;
