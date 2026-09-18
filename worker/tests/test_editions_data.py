# worker/tests/test_editions_data.py — the curated facts: every row complete, every date a real date, every fact with a source.
from datetime import datetime, timezone
from ggrstats import editions_data as ed, config

def test_every_past_boat_is_complete_and_sourced():
    for key, rows in ed.TEAMS.items():
        assert key in ed.EDITIONS
        for r in rows:
            for c in ("id", "name", "yacht", "design_class", "status", "ended_how", "source"):
                assert r.get(c), (key, r.get("id"), c)
            assert r["status"] in ("finished", "retired")
            assert r["source"].startswith("https://"), (key, r["id"])
            assert "PASTE" not in r["source"] and "PASTE" not in (r["ended_where"] or "") and "PASTE" not in (r["class_note"] or "")
            if r["status"] == "finished": assert r["ended_where"] == "Les Sables-d’Olonne"
            assert r["ended_at"] > ed.EDITIONS[key]["start"], (key, r["id"])
            assert " " in r["name"], (key, r["id"])                         # full names, never a surname alone
            assert r["first_name"] is None                                  # past sailors, never a first-name-only row

def test_counts_match_the_record():
    assert len(ed.TEAMS["ggr2018"]) == 17 and len(ed.TEAMS["ggr2022"]) == 16
    assert sum(r["status"] == "finished" for r in ed.TEAMS["ggr2018"]) == 5
    assert sum(r["status"] == "finished" for r in ed.TEAMS["ggr2022"]) == 5    # three in the race, two in the Chichester class
    assert {r["id"] for r in ed.TEAMS["ggr2018"]} == {2, 5, 6, 7, 8, 11, 15, 22, 37, 56, 67, 68, 73, 85, 88, 94, 888}
    assert {r["id"] for r in ed.TEAMS["ggr2022"]} == {1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17}
    assert 77 not in {r["id"] for r in ed.TEAMS["ggr2018"]}                     # Cappelletti never crossed the line

def test_known_dates():
    row = lambda key, i: next(r for r in ed.TEAMS[key] if r["id"] == i)
    at = lambda r: datetime.fromtimestamp(r["ended_at"], timezone.utc)

    assert at(row("ggr2018", 8)).strftime("%Y-%m-%d %H:%M") == "2019-01-29 09:12"                   # Van Den Heede
    assert at(row("ggr2018", 2)).strftime("%Y-%m-%d %H:%M") == "2019-03-10 09:00"                   # Randmaa
    assert at(row("ggr2018", 5)).strftime("%Y-%m-%d %H:%M") == "2018-09-21 12:09"                   # Tomy
    r94 = row("ggr2018", 94)
    assert at(r94).date().isoformat() == "2018-07-06" and r94["time_known"] is False and r94["ended_where"] == "A Coruña"   # Beskardes
    assert at(row("ggr2018", 888)).date().isoformat() == "2018-08-24"                                # Cousot
    assert at(row("ggr2018", 11)).date().isoformat() == "2018-12-12"                                 # Zaretskiy: ends at the haul-out

    assert at(row("ggr2022", 14)).strftime("%Y-%m-%d %H:%M") == "2022-09-18 04:45" and row("ggr2022", 14)["ended_how"] == "aground"    # deBoer
    assert at(row("ggr2022", 1)).strftime("%Y-%m-%d %H:%M") == "2022-11-18 06:54" and row("ggr2022", 1)["ended_how"] == "sank"         # Lehtinen
    assert at(row("ggr2022", 8)).strftime("%Y-%m-%d %H:%M") == "2023-06-09 16:33"                    # Bagshaw
    assert at(row("ggr2022", 7)).strftime("%Y-%m-%d %H:%M") == "2023-04-27 19:43"                    # Neuschäfer
    assert at(row("ggr2022", 10)).date().isoformat() == "2022-09-08"                                 # Walentynowicz

def test_ended_how_vocabulary_and_status_consistency():
    vocab = {"finished", "retired", "dismasted", "sank", "aground"}
    for key, rows in ed.TEAMS.items():
        for r in rows:
            assert r["ended_how"] in vocab, (key, r["id"], r["ended_how"])
            assert (r["status"] == "finished") == (r["ended_how"] == "finished"), (key, r["id"])
            assert r["ended_at"] > ed.EDITIONS[key]["start"], (key, r["id"])

def test_veteran_hulls_and_returning_skippers():
    assert len(ed.VETERAN_HULLS) == 7 and all(h["source"].startswith("https://") for h in ed.VETERAN_HULLS)
    beagle = next(h for h in ed.VETERAN_HULLS if h["yacht_2026"] == "Miss Beagle")
    assert beagle["races"][0] == {"race_key": "ggr2018", "team_id": 8, "yacht_then": "Matmut", "note": "won the race"}
    ids_by_race = {key: {r["id"] for r in rows} for key, rows in ed.TEAMS.items()}
    for h in ed.VETERAN_HULLS:
        for rc in h["races"]:
            assert set(rc.keys()) == {"race_key", "team_id", "yacht_then", "note"}
            assert rc["team_id"] in ids_by_race[rc["race_key"]], (h["yacht_2026"], rc)
    for r in ed.RETURNING:
        for rc in r["races"]:
            assert rc["team_id"] in ids_by_race[rc["race_key"]], (r["team_2026"], rc)
    assert {r["first"] for r in ed.RETURNING} == {"Damien", "Pat", "Ertan", "Guy"}

def test_milestones_and_2026_start():
    assert [m[0] for m in ed.MILESTONES] == ["Lanzarote", "Equator", "Cape of Good Hope", "Hobart", "Cape Horn", "Finish"]
    assert ed.EDITIONS["ggr2026"]["start"] == config.START_AT
