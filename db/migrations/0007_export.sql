-- db/migrations/0007_export.sql — the data files of the Data page (2026-09-19). Apply with psql after 0006; safe to re-run.
-- (0005 belongs to the Past-races work and may arrive after this one.)
-- One row per boat per 4-hour report with everything a row of a data file needs, so that the site reads one view and a month stays
-- a few small requests. It gathers and never judges: what is blanked for a boat without a current fix, and every rounding, is
-- decided in site/lib/export-columns.ts, where tests hold it. security_invoker: the view checks the caller's rights, not the owner's.
create or replace view export_report with (security_invoker = true) as
select b.race_key, b.as_of, b.team_id,
  (extract(hour from b.as_of at time zone 'UTC') = 0 and extract(minute from b.as_of at time zone 'UTC') = 0) as closes_day,
  t.name as skipper, t.yacht, t.model as design, t.country_code as country,
  b.rank, b.rank_change, b.dtf_nm, b.gap_nm, b.interval_nm, b.last_fix_at, b.stale, b.lat, b.lon,
  b.spd24, b.run24_nm, b.spd7, b.run7_nm, b.vmg7_kn, b.sailed_nm, b.made_good_nm,
  b.best4_kn, b.best24_nm, b.best24_at, b.best7_nm, b.pb24, b.fleet_best24, b.run24_bridged,
  b.vs_vdh_nm, b.vs_kirsten_nm, b.next_mark, b.next_mark_nm, b.next_mark_eta, b.restart_at,
  b.gain24_nm, b.vs_near_nm, b.near_n, b.lever_nm, b.lever_dir,
  p.wind_ratio, p.wind_legs, p.sd7, p.share5_7, p.parked_h7, p.night_delta,
  l.dist_nm as leg_nm, l.speed_kn as leg_kn, l.vmg_kn as leg_vmg_kn, l.cmg_deg as leg_cmg_deg,
  c.wind_kn, c.gust_kn, c.wind_dir_deg, c.mslp_hpa, c.wave_m, c.swell_m, c.swell_period_s, c.current_kn, c.current_dir_deg, c.sst_c,
  d.leg1_kn, d.leg2_kn, d.leg3_kn, d.leg4_kn, d.leg5_kn, d.leg6_kn, d.legs_complete,
  s.start_lat, s.start_lon, s.start_dtf_nm,
  w.wind_mean_kn, w.wind_max_kn, w.wind_reports
from boat_stat b
join team t on t.race_key = b.race_key and t.id = b.team_id
left join boat_perf p on p.race_key = b.race_key and p.team_id = b.team_id and p.as_of = b.as_of
left join leg l on l.race_key = b.race_key and l.team_id = b.team_id and l.end_slot = b.as_of
left join conditions c on c.race_key = b.race_key and c.team_id = b.team_id and c.fix_at = b.last_fix_at
-- the six 4-hour legs of the 24 hours ending at this report, oldest first, and how many of them exist (a fix at both ends)
left join lateral (
  select max(l2.speed_kn) filter (where l2.end_slot = b.as_of - interval '20 hours') as leg1_kn,
         max(l2.speed_kn) filter (where l2.end_slot = b.as_of - interval '16 hours') as leg2_kn,
         max(l2.speed_kn) filter (where l2.end_slot = b.as_of - interval '12 hours') as leg3_kn,
         max(l2.speed_kn) filter (where l2.end_slot = b.as_of - interval '8 hours')  as leg4_kn,
         max(l2.speed_kn) filter (where l2.end_slot = b.as_of - interval '4 hours')  as leg5_kn,
         max(l2.speed_kn) filter (where l2.end_slot = b.as_of)                       as leg6_kn,
         count(l2.speed_kn)::int as legs_complete
  from leg l2 where l2.race_key = b.race_key and l2.team_id = b.team_id
    and l2.end_slot > b.as_of - interval '24 hours' and l2.end_slot <= b.as_of) d on true
-- where the 24 hours began: the report 24 hours earlier, only when the boat had a current fix at it
left join lateral (
  select p24.lat as start_lat, p24.lon as start_lon, p24.dtf_nm as start_dtf_nm from boat_stat p24
  where p24.race_key = b.race_key and p24.team_id = b.team_id and p24.as_of = b.as_of - interval '24 hours' and not p24.stale) s on true
-- the day's model wind: over the reports of the 24 hours at which the boat had a current fix and the weather service answered
left join lateral (
  select avg(c2.wind_kn) as wind_mean_kn, max(c2.wind_kn) as wind_max_kn, count(c2.wind_kn)::int as wind_reports
  from boat_stat b2 join conditions c2 on c2.race_key = b2.race_key and c2.team_id = b2.team_id and c2.fix_at = b2.last_fix_at
  where b2.race_key = b.race_key and b2.team_id = b.team_id and b2.as_of > b.as_of - interval '24 hours' and b2.as_of <= b.as_of and not b2.stale) w on true;
grant select on export_report to anon, authenticated;
