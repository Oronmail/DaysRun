-- db/migrations/0001_init.sql  (apply with: psql "$DATABASE_URL" -f db/migrations/0001_init.sql)
create table if not exists race (
  key text primary key, title text, start_at timestamptz not null, course_km double precision,
  raw_setup jsonb, updated_at timestamptz not null default now());

create table if not exists team (
  race_key text not null references race(key), id int not null, name text not null, first_name text,
  country text, country_code text, flag text, model text, yacht text, design_class text, sail text, colour text,
  is_ghost boolean not null default false, ghost_label text, status text, start_at timestamptz,
  primary key (race_key, id));

create table if not exists fix (
  race_key text not null, team_id int not null, at timestamptz not null,
  lat double precision not null, lon double precision not null, dtf_m integer,
  primary key (race_key, team_id, at), foreign key (race_key, team_id) references team(race_key, id));
create index if not exists fix_race_at on fix (race_key, at);

create table if not exists leaderboard_snap (
  race_key text not null, fetched_at timestamptz not null, team_id int not null,
  rank_r int, rank_s int, dtf_m bigint, dmg_m bigint, d24_m bigint, vmg_r_kmh double precision, vmg_s_kmh double precision,
  e_finish_r timestamptz, e_finish_s timestamptz, status text, old boolean, raw jsonb,
  primary key (race_key, fetched_at, team_id));

create table if not exists split (
  race_key text not null, team_id int not null, checkpoint_id int not null, checkpoint_name text, checkpoint_index int,
  start_at timestamptz, stop_at timestamptz, duration_s bigint, delta_best_s bigint, delta_preceding_s bigint,
  primary key (race_key, team_id, checkpoint_id));

create table if not exists restart (
  race_key text not null, team_id int not null, as_of timestamptz not null,
  last_in_port_at timestamptz not null, first_out_at timestamptz not null,
  primary key (race_key, team_id, as_of));

create table if not exists leg (
  race_key text not null, team_id int not null, end_slot timestamptz not null,
  start_at timestamptz, end_at timestamptz, hours double precision, dist_nm double precision, made_good_nm double precision,
  speed_kn double precision, vmg_kn double precision, cmg_deg double precision, bridged boolean,
  primary key (race_key, team_id, end_slot), foreign key (race_key, team_id) references team(race_key, id));

create table if not exists boat_stat (
  race_key text not null, team_id int not null, as_of timestamptz not null,
  rank int, rank_change int, dtf_nm double precision, gap_nm double precision, interval_nm double precision,
  last_fix_at timestamptz, stale boolean, lat double precision, lon double precision, position_text text,
  spd4 double precision, vmg4 double precision, cmg4 double precision,
  spd24 double precision, vmg24 double precision, run24_nm double precision,
  spd7 double precision, run7_nm double precision,
  best4_kn double precision, best4_at timestamptz, best24_nm double precision, best24_at timestamptz,
  best7_nm double precision, best7_at timestamptz,
  sailed_nm double precision, made_good_nm double precision, vmg7_kn double precision,
  pb24 boolean, fleet_best24 boolean,
  vs_vdh_nm double precision, vs_vdh_days double precision, vs_kirsten_nm double precision, vs_kirsten_days double precision,
  next_mark text, next_mark_nm double precision, next_mark_eta timestamptz,
  restart_at timestamptz, speed_log_json jsonb,
  primary key (race_key, team_id, as_of), foreign key (race_key, team_id) references team(race_key, id));
create index if not exists boat_stat_asof on boat_stat (race_key, as_of desc);

create table if not exists fleet_stat (
  race_key text not null, as_of timestamptz not null, race_day int, leader_team_id int, spread_nm double precision,
  best_run24_nm double precision, best_run24_team_id int, ahead_vdh int, ahead_kirsten int,
  vdh_dtf_nm double precision, kirsten_dtf_nm double precision, next_mark text, racing int, retired int,
  primary key (race_key, as_of));

create table if not exists record_board (
  race_key text not null, as_of timestamptz not null, kind text not null, win text not null, rank int not null,
  team_id int, value double precision, at timestamptz,
  primary key (race_key, as_of, kind, win, rank), foreign key (race_key, team_id) references team(race_key, id));

create table if not exists sprint_result (
  race_key text not null, as_of timestamptz not null, sprint_name text not null, team_id int not null,
  start_at timestamptz, end_at timestamptz, hours double precision,
  primary key (race_key, as_of, sprint_name, team_id), foreign key (race_key, team_id) references team(race_key, id));

create table if not exists conditions (
  race_key text not null, team_id int not null, fix_at timestamptz not null, lat double precision, lon double precision,
  wind_kn double precision, gust_kn double precision, wind_dir_deg double precision, mslp_hpa double precision,
  wave_m double precision, swell_m double precision, swell_period_s double precision,
  current_kn double precision, current_dir_deg double precision, sst_c double precision, fetched_at timestamptz,
  primary key (race_key, team_id, fix_at));

create table if not exists event (
  id bigserial primary key, race_key text not null, at timestamptz not null, kind text not null, team_id int,
  title text not null, body text, page text, dedupe_key text not null unique,
  foreign key (race_key, team_id) references team(race_key, id));
create index if not exists event_race_at on event (race_key, at desc);

-- Supabase ships the roles anon and authenticated; a plain Postgres (the local test database) does not,
-- and `create policy … to anon` fails without them. No-op on Supabase.
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;

-- Access model: the site reads through the Data API with the public key; the worker writes over its own Postgres
-- connection as the table owner. Privileges are explicit (select only), so the schema behaves the same whether or
-- not the project's "Automatically expose new tables" setting is on; row-level security is the second lock.
do $$ declare t text; begin
  foreach t in array array['race','team','fix','leaderboard_snap','split','restart','leg','boat_stat','fleet_stat',
                           'record_board','sprint_result','conditions','event'] loop
    execute format('revoke all on %I from anon, authenticated', t);
    execute format('grant select on %I to anon, authenticated', t);
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists public_read on %I', t);
    execute format('create policy public_read on %I for select to anon, authenticated using (true)', t);
  end loop; end $$;
