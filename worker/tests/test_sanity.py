# worker/tests/test_sanity.py — the gate a snapshot passes before it is published (stats.sanity_problems), and the monitoring wrapper.
import copy, gzip, json, pathlib
import pytest
from ggrstats import stats, monitoring

FIX = pathlib.Path(__file__).parent / "fixtures"
T = 1789516800                                                     # 2026-09-16 00:00 UTC

@pytest.fixture(scope="module")
def snap():
    teams = json.load(gzip.open(FIX / "AllPositions3.master.20260916T0230.json.gz"))
    setup = json.load(open(FIX / "RaceSetup.20260916.json"))
    return stats.compute_snapshot(setup, {t["id"]: stats.sorted_fixes(t["moments"]) for t in teams}, T), setup["course"]["distance"] / 1.852

def prev_of(s, hours=4):
    return [{"team_id": b["id"], "dtf_nm": b["dtf_nm"] + 20, "as_of_s": s["as_of"] - hours * 3600, "stale": False} for b in s["boats"]]

def test_the_real_fleet_passes(snap):
    s, course = snap
    assert stats.sanity_problems(s, prev_of(s), course) == []
    assert stats.sanity_problems(s, [], course) == []                                  # the first report of all: nothing to compare with

def test_a_boat_that_vanished_is_refused(snap):
    s, course = snap; bad = copy.deepcopy(s); gone = bad["boats"].pop(5)
    assert stats.sanity_problems(bad, prev_of(s), course)[0] == f"1 boat of the previous report is missing: {gone['first']}"

def test_places_must_be_one_to_n(snap):
    s, course = snap; bad = copy.deepcopy(s); bad["boats"][3]["rank"] = bad["boats"][2]["rank"]
    assert any(p.startswith("places are not 1 to 16") for p in stats.sanity_problems(bad, prev_of(s), course))

def test_an_impossible_run_or_leg_is_refused(snap):
    s, course = snap; bad = copy.deepcopy(s); b = bad["boats"][0]; b["w24"] = dict(b["w24"], dist_nm=412.0)
    assert stats.sanity_problems(bad, prev_of(s), course) == [f"{b['first']}: a 24-hour run of 412 nm (limit 260)"]
    bad = copy.deepcopy(s); b = next(x for x in bad["boats"] if x["w4"]); b["w4"] = dict(b["w4"], speed_kn=19.4)
    assert stats.sanity_problems(bad, prev_of(s), course) == [f"{b['first']}: a 4-hour leg at 19.4 kt (limit 12)"]

def test_distance_to_finish_must_make_sense(snap):
    s, course = snap; bad = copy.deepcopy(s); b = bad["boats"][0]; b["dtf_nm"] = course + 900
    assert stats.sanity_problems(bad, prev_of(s), course)[0].startswith(f"{b['first']}: {round(course + 900)} nm to go, more than the course")
    bad = copy.deepcopy(s); b = bad["boats"][0]; was = prev_of(s); was[0]["dtf_nm"] = b["dtf_nm"] - 300
    assert stats.sanity_problems(bad, was, course) == [f"{b['first']}: distance to finish rose by 300 nm in 4 hours (limit 60)"]
    was = prev_of(s, hours=24); was[0]["dtf_nm"] = b["dtf_nm"] - 300                    # after a day's outage a boat may have lost more ground: 60 nm per 4 hours
    assert stats.sanity_problems(bad, was, course) == []

def test_a_snapshot_off_the_four_hour_grid_is_refused(snap):
    s, course = snap
    assert stats.sanity_problems(dict(s, as_of=T + 600), prev_of(s), course) == ["the snapshot's time is not a 4-hourly report time"]

def test_monitoring_is_silent_without_a_dsn(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    assert monitoring.init() is False
    monitoring.warn("nothing listens")                                                # must not raise
    with monitoring.checkin("worker-all"):
        pass
    with pytest.raises(RuntimeError):                                                 # and never swallows the job's own error
        with monitoring.checkin("worker-all"):
            raise RuntimeError("boom")
