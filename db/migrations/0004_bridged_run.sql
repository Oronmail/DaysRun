-- 0004: whether a boat's 24-hour run crossed a silent tracker.
-- The worker has always known it (grid.window marks a window that misses a slot as bridged, and records already refuse such a
-- window), but it was never stored, so every page but the daily board printed a run across a silence as though it were measured.
-- Such a run is a MINIMUM: the boat is credited with the straight line between the fixes either side of the gap, never with the
-- miles she actually sailed. Marked on the site, and kept out of the figures that compare boats with each other.
-- Applied by hand before the worker code that writes it (RUNBOOK, "A new migration"), then history re-derived.
alter table boat_stat add column if not exists run24_bridged boolean not null default false;
comment on column boat_stat.run24_bridged is 'the 24-hour run crossed a report the tracker missed: it is a lower bound';
