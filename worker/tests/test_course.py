# worker/tests/test_course.py
import gzip, json, pathlib
from ggrstats import config, course, stats, events

FIX = pathlib.Path(__file__).parent / "fixtures"
T = 1789516800                                                     # 2026-09-16 0000 UTC

def setup():
    return json.load(open(FIX / "RaceSetup.20260916.json"))

def fleet():
    teams = json.load(gzip.open(FIX / "AllPositions3.master.20260916T0230.json.gz"))
    return {t["id"]: stats.sorted_fixes(t["moments"]) for t in teams}

def test_the_marks_are_the_waypoints_of_nor_c13_in_course_order():
    names = [m[0] for m in config.MARKS]
    assert names == ["Lanzarote", "Trindade", "45°S 40°E", "45°S 65°E", "45°S 90°E", "45°S 110°E", "Cape Leeuwin", "Hobart Gate",
                     "50°S 168°E", "49°S 150°W", "49°S 130°W", "49°S 110°W", "50°S 90°W", "Cape Horn", "Les Sables-d’Olonne"]

def test_course_length_is_ybs_own():
    """YB measures its course with one nautical mile per minute of arc; with that, the sum of the course legs is YB's
    published course distance to a tenth of a mile, so a mark's distance to finish is on the same scale as a boat's."""
    st = setup()
    assert abs(course.course_length_nm(st["course"]["nodes"]) - st["course"]["distance"] / 1.852) < 0.5

def test_every_mark_has_a_distance_to_finish_and_they_fall_in_course_order():
    togo = course.mark_togo(setup()["course"]["nodes"], config.MARKS, observed={})
    vals = [togo[m[0]] for m in config.MARKS]
    assert vals == sorted(vals, reverse=True) and vals[-1] == 0.0                 # the finish is the last mark
    assert abs(togo["Lanzarote"] - 24477.3) < 1 and abs(togo["Trindade"] - 21372.8) < 1
    assert abs(togo["Cape Leeuwin"] - 14384.0) < 2 and abs(togo["Cape Horn"] - 7040.3) < 2   # Leeuwin lies 560 nm off the course line: abeam counts

def test_an_observed_distance_wins_over_the_computed_one():
    """Two boats passed within 1.2 nm of the Lanzarote mark with YB showing 24,469.8 and 24,468.9 nm to go, eight miles
    less than the course sum says: YB cuts the last bend before the mark. What YB showed is what a boat is compared with."""
    togo = course.mark_togo(setup()["course"]["nodes"], config.MARKS)
    assert togo["Lanzarote"] == config.MARK_TOGO_OBSERVED["Lanzarote"] == 24469.5

def test_next_mark_is_the_first_one_not_yet_passed():
    togo = course.mark_togo(setup()["course"]["nodes"], config.MARKS)
    nxt = lambda dtf: course.next_mark(dtf, config.MARKS, togo)[0]
    assert nxt(24562.0) == "Lanzarote"                              # Ertan, 17 Sep 1200
    assert nxt(24468.0) == "Lanzarote"                              # a mile and a half past on YB's scale: inside the margin, not said yet
    assert nxt(24465.0) == "Trindade"
    assert nxt(24314.0) == "Trindade"                               # Damien, 17 Sep 1200
    assert nxt(21372.8 - 5) == "Trindade"                           # a computed distance carries a wider margin than an observed one
    assert nxt(21372.8 - 13) == "45°S 40°E"
    assert nxt(14300.0) == "Hobart Gate" and nxt(7000.0) == "Les Sables-d’Olonne" and nxt(0.0) == "Les Sables-d’Olonne"

def test_snapshot_on_race_day_10_has_the_whole_fleet_bound_for_lanzarote():
    snap = stats.compute_snapshot(setup(), fleet(), T)
    assert {b["next_mark"] for b in snap["boats"]} == {"Lanzarote"}

def test_a_mark_once_passed_stays_passed():
    """A boat that rounds a mark and then loses ground (tacking back, drifting, returning for repairs) has not un-rounded it."""
    st, fx = setup(), fleet()
    last = fx[6][-1]
    past = [dict(last, at=last["at"] + 4 * 3600 * (i + 1), dtf=int(d * 1852)) for i, d in enumerate((24480.0, 24460.0, 24475.0))]
    fx[6] = fx[6] + past
    snap = stats.compute_snapshot(st, fx, past[-1]["at"])
    damien = next(b for b in snap["boats"] if b["id"] == 6)
    assert damien["next_mark"] == "Trindade"

def test_distance_to_the_finish_is_ybs_distance_to_finish():
    st, fx = setup(), fleet()
    last = fx[6][-1]
    fx[6] = fx[6] + [dict(last, at=last["at"] + 4 * 3600, lat=40.0, lon=-20.0, dtf=int(1500.0 * 1852))]
    snap = stats.compute_snapshot(st, fx, last["at"] + 4 * 3600)
    damien = next(b for b in snap["boats"] if b["id"] == 6)
    assert damien["next_mark"] == "Les Sables-d’Olonne" and round(damien["next_mark_nm"]) == 1500   # not a great circle across Brazil

def _prev(s, **over):
    return [dict({"team_id": b["id"], "rank": b["rank"], "best24_nm": b["best24_nm"], "stale": b["stale"], "next_mark": b["next_mark"],
                  "fleet_best24": b["fleet_best24"], "pb24": b["pb24"]}, **over) for b in s["boats"]]

def test_a_mark_passed_is_said_in_the_words_that_fit_it():
    s = stats.compute_snapshot(setup(), fleet(), T)
    said = lambda was, now: [e["title"] for e in events.derive(dict(s, boats=[dict(b, next_mark=now) for b in s["boats"]]), _prev(s, next_mark=was), [])
                             if e["kind"] == "next_mark" and "Damien" in e["title"] and " from " not in e["title"]]
    assert said("Lanzarote", "Trindade") == ["Damien has rounded Lanzarote"]
    assert said("Trindade", "45°S 40°E") == ["Damien has rounded Trindade"]
    assert said("45°S 40°E", "45°S 65°E") == ["Damien has passed the 45°S 40°E waypoint"]
    assert said("Hobart Gate", "50°S 168°E") == ["Damien is through the Hobart Gate"]
    assert said("Cape Horn", "Les Sables-d’Olonne") == ["Damien has rounded Cape Horn"]

def test_a_next_mark_that_goes_backwards_says_nothing():
    """The rule for the next mark changed on 17 Sep 2026; a snapshot derived by the old rule next to one derived by the new
    one must not produce 'has rounded Trindade'."""
    s = stats.compute_snapshot(setup(), fleet(), T)
    ev = events.derive(s, _prev(s, next_mark="Trindade"), [])
    assert not [e for e in ev if e["kind"] == "next_mark" and "rounded" in e["title"]]
