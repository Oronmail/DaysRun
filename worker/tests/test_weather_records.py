# worker/tests/test_weather_records.py — the weather boards on the Records page: the weather a boat MET according to the model,
# per window (7 days, 30 days, the race), from the stored conditions rows.
from ggrstats import weather_records as wr

H = 3600
T = 1789732800                       # 2026-09-18 12:00 UTC
def rows(start, values):             # one row per 4-hour report from `start`, values = [(wind, gust, wave), ...]
    return [{"at": start + i * 4 * H, "wind_kn": w, "gust_kn": g, "wave_m": h} for i, (w, g, h) in enumerate(values)]

def test_strongest_wind_and_highest_wave_are_each_boat_s_own_best_ranked_across_the_fleet():
    cond = {8: rows(T - 40 * H, [(12, 18, 1.0), (30.0, 43.0, 3.9), (22, 30, 3.0)]),
            9: rows(T - 40 * H, [(29.9, 43.0, 2.0), (10, 14, 3.9), (8, 11, 1.5)]),
            1: rows(T - 40 * H, [(5, 8, 0.8), (27.4, 37.9, 3.1), (5, 7, 0.9)])}
    recs = wr.compute(cond, T)
    wind = [(r["rank"], r["team_id"], r["value"], r["at"]) for r in recs if r["kind"] == "wind" and r["win"] == "race"]
    assert wind == [(1, 8, 30.0, T - 36 * H), (2, 9, 29.9, T - 40 * H), (3, 1, 27.4, T - 36 * H)]
    gust = {r["team_id"]: r["value"] for r in recs if r["kind"] == "gust" and r["win"] == "race"}
    assert gust == {8: 43.0, 9: 43.0, 1: 37.9}                                   # the gust AT the strongest-wind report, not the boat's biggest gust
    wave = [(r["rank"], r["team_id"], r["value"]) for r in recs if r["kind"] == "wave" and r["win"] == "race"]
    assert wave == [(1, 8, 3.9), (2, 9, 3.9), (3, 1, 3.1)]                       # a tie keeps the earlier one first

def test_the_longest_calm_is_consecutive_reports_under_six_knots_and_needs_at_least_two():
    cond = {15: rows(T - 60 * H, [(9, 12, 1), (5.9, 8, 1), (2.1, 3, 1), (4, 6, 1), (3, 5, 1), (7, 9, 1), (5, 6, 1), (5, 6, 1), (12, 15, 1)]),
            12: rows(T - 60 * H, [(5, 7, 1), (14, 18, 1), (5, 7, 1)])}             # single calm reports only: no spell
    recs = wr.compute(cond, T)
    calm = [(r["rank"], r["team_id"], r["value"], r["at"]) for r in recs if r["kind"] == "calm" and r["win"] == "race"]
    assert calm == [(1, 15, 16.0, T - 56 * H)]                                  # four reports = 16 hours, from the first calm report
    assert [r for r in recs if r["kind"] == "calm" and r["team_id"] == 12] == []

def test_a_missed_report_breaks_a_calm_spell():
    r = rows(T - 40 * H, [(3, 5, 1), (3, 5, 1), (3, 5, 1), (3, 5, 1)]); del r[2]        # the third report never came
    recs = wr.compute({15: r}, T)
    assert [(x["value"], x["at"]) for x in recs if x["kind"] == "calm" and x["win"] == "race"] == [(8.0, T - 40 * H)]

def test_off_hour_rows_from_a_fast_tracker_do_not_make_a_spell_longer():
    r = rows(T - 40 * H, [(3, 5, 1), (3, 5, 1)]) + [{"at": T - 40 * H + 30 * 60, "wind_kn": 3, "gust_kn": 5, "wave_m": 1}, {"at": T - 40 * H + 60 * 60, "wind_kn": 3, "gust_kn": 5, "wave_m": 1}]
    recs = wr.compute({15: r}, T)
    assert [x["value"] for x in recs if x["kind"] == "calm" and x["win"] == "race"] == [8.0]

def test_windows_keep_only_what_lies_inside_them_and_the_boards_stop_at_five():
    cond = {i: rows(T - 10 * 24 * H, [(10 + i, 12 + i, 1.0)]) + rows(T - 2 * 24 * H, [(20 + i, 25 + i, 2.0)]) for i in range(1, 8)}
    recs = wr.compute(cond, T)
    seven = [r for r in recs if r["kind"] == "wind" and r["win"] == "7d"]
    assert [r["value"] for r in seven] == [27, 26, 25, 24, 23, 22, 21] and all(r["at"] >= T - 7 * 24 * H for r in seven)   # every boat is ranked (the page's table needs all)
    assert [r["rank"] for r in seven] == [1, 2, 3, 4, 5, 6, 7]
    assert [r["value"] for r in recs if r["kind"] == "wind" and r["win"] == "race"][:3] == [27, 26, 25]

def test_nothing_without_data():
    assert wr.compute({}, T) == []
    assert wr.compute({3: [{"at": T, "wind_kn": None, "gust_kn": None, "wave_m": None}]}, T) == []
