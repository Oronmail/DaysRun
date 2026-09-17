-- db/migrations/0003_duels.sql — the private races inside the fleet (2026-09-17). Apply with psql after 0002; safe to re-run.
create table if not exists duel (
  race_key text not null, as_of timestamptz not null, ahead_id int not null, behind_id int not null,
  gap_nm double precision not null,            -- distance to finish of the boat behind minus the boat ahead
  gap24_nm double precision, gap72_nm double precision,   -- the same 24 h and 72 h earlier; negative: the boat now ahead was behind then
  lead_changes int not null default 0, passed_at timestamptz,
  water_nm double precision, side text,        -- how far apart on the water, and where the boat behind lies from the boat ahead
  series_json jsonb,                           -- [[unix seconds, gap nm], …] at each 4-hour report of the last three days
  primary key (race_key, as_of, ahead_id, behind_id),
  foreign key (race_key, ahead_id) references team(race_key, id), foreign key (race_key, behind_id) references team(race_key, id));
revoke all on duel from anon, authenticated;
grant select on duel to anon, authenticated;
alter table duel enable row level security;
drop policy if exists public_read on duel;
create policy public_read on duel for select to anon, authenticated using (true);
