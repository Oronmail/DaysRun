# worker/tests/test_edition_fixtures.py — pins what editions.py (task 5) relies on: the past-races fixtures are
# real, complete tracks fetched from YB's own public endpoints (see fixtures/make_edition_samples.py).
import gzip, json, pathlib
from datetime import datetime, timezone
from ggrstats import db, editions_data

FIX = pathlib.Path(__file__).parent / "fixtures"
KEEP = {"ggr2018": {8, 7, 68, 94}, "ggr2022": {11, 7, 4, 14, 1}}
# Fixes after the start measured on YB's live files, 18 Sep 2026 (task-4 brief); the fixture keeps at least 60% of each.
EXPECTED = {"ggr2018": {8: 1570, 7: 390, 68: 1815, 94: 65}, "ggr2022": {11: 2650, 7: 2280, 4: 815, 14: 480, 1: 960}}

def _sample(race):
    return json.load(gzip.open(FIX / f"{race}.sample.json.gz", "rt"))

def _setup(race):
    return json.loads((FIX / f"RaceSetup.{race}.json").read_text())

def _zeg(race):
    return json.loads((FIX / f"zegments.{race}.json").read_text())

def test_sample_holds_exactly_the_brief_ids_sorted_and_mostly_complete():
    for race, ids in KEEP.items():
        teams = _sample(race)
        assert {t["id"] for t in teams} == ids, race
        for t in teams:
            ats = [m["at"] for m in t["moments"]]
            assert ats == sorted(ats), (race, t["id"])                                   # sorted by time
            assert len(t["moments"]) >= 0.6 * EXPECTED[race][t["id"]], (race, t["id"], len(t["moments"]))

def test_fixture_race_start_matches_the_curated_start():
    for race in KEEP:
        assert db.race_start(_setup(race)) == editions_data.EDITIONS[race]["start"], race

def test_fixture_course_kept_whole_and_teams_trimmed_to_the_sample():
    for race, ids in KEEP.items():
        setup = _setup(race)
        assert len(setup["course"]["nodes"]) > 400, race
        assert {t["id"] for t in setup["teams"]} == ids, race

def test_zegments_names_the_sampled_finishers_and_has_hobart_and_horn():
    finishers = {"ggr2018": {"Jean-Luc Van Den Heede", "Mark Slats"}, "ggr2022": {"Simon Curwen", "Kirsten Neuschafer"}}
    for race, names in finishers.items():
        zeg = _zeg(race)
        got = {t["name"] for tag in zeg["tags"] for t in tag["teams"]}
        assert names <= got, (race, got)
        assert {2411, 4200} <= {c["index"] for c in zeg["course"]}, race

def test_2018_sample_covers_the_three_hourly_week():
    """4 Jul 12:00 to 9 Jul 06:00 UTC 2018 the whole fleet reported every three hours, a rhythm the site's 4-hour grid
    meets only at 00:00 and 12:00; the next task's central test needs 03:00 and 09:00 fixes inside that week too."""
    van_den_heede = next(t for t in _sample("ggr2018") if t["id"] == 8)
    ats = [m["at"] for m in van_den_heede["moments"]]
    near = lambda y, m, d, hh, mm: any(abs(a - int(datetime(y, m, d, hh, mm, tzinfo=timezone.utc).timestamp())) <= 120 for a in ats)
    assert near(2018, 7, 6, 3, 0)
    assert near(2018, 7, 6, 9, 0)

def test_2022_sample_holds_the_finish_fix_and_the_stranded_tracker():
    teams = _sample("ggr2022")
    curwen = next(t for t in teams if t["id"] == 11)
    deboer = next(t for t in teams if t["id"] == 14)
    finish_day = lambda a: datetime.fromtimestamp(a, timezone.utc).date().isoformat() == "2023-04-27"
    assert any(finish_day(m["at"]) for m in curwen["moments"])
    stranded_at = int(datetime(2022, 9, 18, 4, 45, tzinfo=timezone.utc).timestamp())
    assert any(m["at"] > stranded_at for m in deboer["moments"])                          # the tracker went on from the rocks
