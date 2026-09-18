# worker/ggrstats/editions_data.py
"""The curated facts about the past races: names as they should be spelled, yachts, designs, and how, where and when
each boat's race ended. A boat's race ends at the race's own record, never when the tracker falls silent: hulls
drifted on for weeks after the sailor left them, and some trackers went on for months from a quay or a rescue ship;
a retirement announced at sea counts from the announcement, not from the boat's last fix. One row departs from the
record on purpose and says so in its class_note: Igor Zaretskiy (2018) hauled Esmeralda out at Albany in December
2018 and never sailed her again, but the race did not record the withdrawal until 3 Oct 2019; this row ends at the
haul-out. 2018 had 17 starters of 18 entries: Francesco Cappelletti (id 77) never crossed the start line, so 77 is in
EDITIONS["ggr2018"]["skip"] and carries no row. Chichester-class boats count as racing until they finished or retired
(the owner's ruling). Every row cites the page it comes from."""
D = lambda y, m, d, hh=12, mm=0, ss=0: int(__import__("datetime").datetime(y, m, d, hh, mm, ss, tzinfo=__import__("datetime").timezone.utc).timestamp())

EDITIONS = {"ggr2018": {"label": "2018", "start": D(2018, 7, 1, 10, 0), "skip": {1968, 77}},           # 1968: Suhaili's replay; 77: Cappelletti never crossed the line
            "ggr2022": {"label": "2022", "start": D(2022, 9, 4, 14, 0), "skip": {19, 20, 21, 22}},     # three replays and "Explorer", a boat of the finish week
            "ggr2026": {"label": "2026", "start": D(2026, 9, 6, 12, 30), "skip": {978, 940, 957, 985}}}

def _t(id, name, yacht, design, status, ended_at, how, where, source, class_note=None, time_known=True, first=None):
    return {"id": id, "name": name, "first_name": first, "yacht": yacht, "model": design,
            "design_class": design[:-len(" ketch")] if design.endswith(" ketch") else design,
            "status": status, "start_at": None, "ended_at": ended_at, "ended_how": how, "ended_where": where,
            "class_note": class_note, "source": source, "time_known": time_known}

TEAMS = {
 "ggr2018": [
  _t(8, "Jean-Luc Van Den Heede", "Matmut", "Rustler 36", "finished", D(2019, 1, 29, 9, 12), "finished", "Les Sables-d’Olonne", "https://www.sailingscuttlebutt.com/2019/01/29/golden-globe-van-den-heede-wins/", class_note="the winner"),
  _t(68, "Mark Slats", "Ohpen Maverick", "Rustler 36", "finished", D(2019, 1, 31, 22, 18), "finished", "Les Sables-d’Olonne", "https://www.yachtingmonthly.com/boat-events/golden-globe-race/mark-slats-takes-second-place-68704"),
  _t(2, "Uku Randmaa", "One and All", "Rustler 36", "finished", D(2019, 3, 10, 9, 0), "finished", "Les Sables-d’Olonne", "https://goldengloberace.com/uku-randmaa-claims-3rd-podium-place-in-golden-globe-race/"),
  _t(37, "Istvan Kopar", "Puffin", "Tradewind 35", "finished", D(2019, 3, 21, 13, 58), "finished", "Les Sables-d’Olonne", "https://goldengloberace.com/day-263-istvan-kopar-secures-4th-place-in-the-golden-globe-race/"),
  _t(6, "Tapio Lehtinen", "Asteria", "Gaia 36", "finished", D(2019, 5, 19, 18, 21), "finished", "Les Sables-d’Olonne", "https://www.sailingscuttlebutt.com/2019/05/19/final-finisher-for-golden-globe-race/"),
  _t(94, "Ertan Beskardes", "Lazy Otter", "Rustler 36", "retired", D(2018, 7, 6), "retired", "A Coruña", "https://goldengloberace.com/philippe-peche-strengthens-lead-over-top-four-ggr-sailors/", time_known=False),
  _t(15, "Kevin Farebrother", "Sagarmatha", "Tradewind 35", "retired", D(2018, 7, 15), "retired", "Lanzarote", "https://goldengloberace.com/peche-and-slats-slug-it-out-at-the-front/", time_known=False),
  _t(67, "Nabil Amra", "Liberty II", "Biscay 36 ketch", "retired", D(2018, 7, 18), "retired", "Tenerife", "https://goldengloberace.com/and-then-there-were-12/", time_known=False),
  _t(85, "Philippe Péché", "PRB", "Rustler 36", "retired", D(2018, 8, 24), "retired", "Cape Town", "https://goldengloberace.com/jean-luc-van-den-heede-first-to-round-cape-of-good-hope/", class_note="Chichester class from 13 Aug 2018", time_known=False),
  _t(888, "Antoine Cousot", "Métier Intérim", "Biscay 36 ketch", "retired", D(2018, 8, 24), "retired", "the South Atlantic, bound for Rio de Janeiro", "https://goldengloberace.com/jean-luc-van-den-heede-first-to-round-cape-of-good-hope/", class_note="Chichester class after a stop at Lanzarote", time_known=False),
  _t(7, "Are Wiig", "Olleanna", "OE 32", "retired", D(2018, 8, 27), "dismasted", "about 400 nm south-west of Cape Town", "https://goldengloberace.com/are-wiig-dismasted-400-miles-sw-of-cape-town/", time_known=False),
  _t(22, "Gregor McGuckin", "Hanley Energy Endurance", "Biscay 36 ketch", "retired", D(2018, 9, 21, 11, 0), "dismasted", "the southern Indian Ocean, about 1,900 nm west of Cape Leeuwin", "https://goldengloberace.com/day-82-breaking-news/"),
  _t(5, "Abhilash Tomy", "Thuriya", "Suhaili replica", "retired", D(2018, 9, 21, 12, 9), "dismasted", "the southern Indian Ocean, about 1,900 nm west of Cape Leeuwin", "https://goldengloberace.com/day-82-breaking-news/"),
  _t(56, "Loïc Lepage", "Laaland", "Nicholson 32", "retired", D(2018, 10, 20), "dismasted", "about 600 nm south-west of Perth", "https://goldengloberace.com/day-111-loic-lepage-dismasted-600-miles-sw-of-perth-australia/", class_note="Chichester class after a stop at Cape Town", time_known=False),
  _t(73, "Susie Goodall", "DHL Starlight", "Rustler 36", "retired", D(2018, 12, 5), "dismasted", "about 2,000 nm west of Cape Horn", "https://goldengloberace.com/day-157-susie-goodall-dismasted-2000-miles-west-of-cape-horn/", time_known=False),
  _t(88, "Mark Sinclair", "Coconut", "Lello 34", "retired", D(2018, 12, 12), "retired", "Adelaide", "https://goldengloberace.com/day-164-lead-narrows-between-mark-slats-and-jean-luc-van-den-heede/", class_note="stopped at Adelaide, the home port, on 5 Dec 2018; completed the course in May 2022", time_known=False),
  _t(11, "Igor Zaretskiy", "Esmeralda", "Endurance 35", "retired", D(2018, 12, 12), "retired", "Albany, Western Australia", "https://goldengloberace.com/bigger-coverage-for-2022-ggr-and-igor-zaretskiy-out/", class_note="Chichester class after hauling out at Albany; never sailed on; the race recorded the withdrawal on 3 Oct 2019", time_known=False)],
 "ggr2022": [
  _t(11, "Simon Curwen", "Clara", "Biscay 36", "finished", D(2023, 4, 27, 10, 0), "finished", "Les Sables-d’Olonne", "https://www.yachtingworld.com/all-latest-posts/simon-curwen-first-finisher-in-golden-globe-race-but-cant-win-overall-145399", class_note="Chichester class after a stop at Puerto Montt, Chile; first home"),
  _t(7, "Kirsten Neuschäfer", "Minnehaha", "Cape George 36", "finished", D(2023, 4, 27, 19, 43, 47), "finished", "Les Sables-d’Olonne", "https://goldengloberace.com/ggr-timeline-2022/", class_note="the winner"),
  _t(17, "Abhilash Tomy", "Bayanat", "Rustler 36", "finished", D(2023, 4, 29, 6, 46), "finished", "Les Sables-d’Olonne", "https://goldengloberace.com/day-237-abhilash-tomys-remarkable-comeback-from-broken-back-to-2nd-place-in-the-golden-globe-race/"),
  _t(9, "Michael Guggenberger", "Nuri", "Biscay 36 ketch", "finished", D(2023, 5, 12, 7, 42), "finished", "Les Sables-d’Olonne", "https://goldengloberace.com/ggr-timeline-2022/"),
  _t(8, "Jeremy Bagshaw", "Olleanna", "OE 32", "finished", D(2023, 6, 9, 16, 33), "finished", "Les Sables-d’Olonne", "https://goldengloberace.com/ggr-timeline-2022/", class_note="Chichester class after a stop at Hobart"),
  _t(10, "Edward Walentynowicz", "Noah's Jest", "Rustler 36", "retired", D(2022, 9, 8), "retired", "the Bay of Biscay", "https://goldengloberace.com/skippers/edward-walentynowicz/", time_known=False),
  _t(14, "Guy deBoer", "Spirit", "Tashiba 36", "retired", D(2022, 9, 18, 4, 45), "aground", "the north coast of Fuerteventura", "https://goldengloberace.com/skippers/guy-deboer/"),
  _t(2, "Mark Sinclair", "Coconut", "Lello 34", "retired", D(2022, 9, 23), "retired", "Lanzarote", "https://goldengloberace.com/skippers/mark-sinclair/", time_known=False),
  _t(5, "Pat Lawless", "Green Rebel", "Saltram Saga 36", "retired", D(2022, 11, 10), "retired", "Cape Town", "https://goldengloberace.com/skippers/pat-lawless/", time_known=False),
  _t(4, "Damien Guillou", "PRB", "Rustler 36", "retired", D(2022, 11, 14), "retired", "Cape Town", "https://goldengloberace.com/skippers/damien-guillou/", class_note="restarted from Les Sables-d’Olonne six days after the start", time_known=False),
  _t(13, "Ertan Beskardes", "Lazy Otter", "Rustler 36", "retired", D(2022, 11, 16), "retired", "Cape Town", "https://goldengloberace.com/ggr-timeline-2022/", time_known=False),
  _t(1, "Tapio Lehtinen", "Asteria", "Gaia 36", "retired", D(2022, 11, 18, 6, 54), "sank", "the southern Indian Ocean, about 450 nm south-east of Port Elizabeth", "https://goldengloberace.com/skippers/tapio-lehtinen/"),
  _t(12, "Arnaud Gaist", "Hermes Phoning", "Barbican 33 Mk II", "retired", D(2022, 12, 1), "retired", "the South Atlantic, west of Cape Town", "https://goldengloberace.com/skippers/arnaud-gaist/", time_known=False),
  _t(16, "Elliott Smith", "Second Wind", "Gale Force 34", "retired", D(2023, 1, 19), "retired", "Fremantle", "https://goldengloberace.com/skippers/elliott-smith/", time_known=False),
  _t(15, "Guy Waites", "Sagarmatha", "Tradewind 35", "retired", D(2023, 2, 10), "retired", "Hobart", "https://goldengloberace.com/skippers/guy-waites/", class_note="Chichester class after a stop at Cape Town; reached Hobart after the gate had closed", time_known=False),
  _t(3, "Ian Herbert-Jones", "Puffin", "Tradewind 35", "retired", D(2023, 4, 10, 18, 42), "dismasted", "the South Atlantic, about 900 nm north-east of the Falkland Islands", "https://www.yachtingworld.com/all-latest-posts/rescue-underway-for-british-solo-skipper-dismasted-and-injured-in-violent-south-atlantic-storm-144946", class_note="Chichester class from 20 Mar 2023")],
}

VETERAN_HULLS = [
 {"yacht_2026": "Miss Beagle", "team_2026": 17, "design": "Rustler 36", "races": [{"race_key": "ggr2018", "team_id": 8, "yacht_then": "Matmut", "note": "won the race"}], "source": "https://goldengloberace.com/skippers/ertan-beskardes/"},
 {"yacht_2026": "IE Charge", "team_2026": 2, "design": "Biscay 36 ketch", "races": [{"race_key": "ggr2022", "team_id": 9, "yacht_then": "Nuri", "note": "third"}, {"race_key": "ggr2018", "team_id": 888, "yacht_then": "Métier Intérim", "note": "retired, bound for Rio de Janeiro"}], "source": "https://goldengloberace.com/skippers/louis-kerdelhue/"},
 {"yacht_2026": "Silvermines Hydro", "team_2026": 10, "design": "Saltram Saga 36", "races": [{"race_key": "ggr2022", "team_id": 5, "yacht_then": "Green Rebel", "note": "retired at Cape Town"}], "source": "https://www.yachtingmonthly.com/boat-events/golden-globe-race/unfinished-business-pat-lawless-says-of-his-return-for-the-2026-golden-globe-race-104046"},
 {"yacht_2026": "Solarem", "team_2026": 6, "design": "Rustler 36", "races": [{"race_key": "ggr2022", "team_id": 4, "yacht_then": "PRB", "note": "retired at Cape Town"}], "source": "https://figaronautisme.meteoconsult.fr/actus-nautisme-flash/2026-04-09/87470-mise-a-leau-du-bateau-de-damien-guillou-a-5-mois-du-depart-de-la-golden-globe-race"},
 {"yacht_2026": "Spirit", "team_2026": 5, "design": "Tashiba 36", "races": [{"race_key": "ggr2022", "team_id": 14, "yacht_then": "Spirit", "note": "aground at Fuerteventura"}], "source": "https://www.yachtingmonthly.com/boat-events/golden-globe-race/not-in-it-for-the-spiritual-experience-says-guy-deboer-ahead-of-the-golden-globe-race-im-a-true-competitor-105883"},
 {"yacht_2026": "Olleanna", "team_2026": 14, "design": "OE 32", "races": [{"race_key": "ggr2022", "team_id": 8, "yacht_then": "Olleanna", "note": "finished, Chichester class"}, {"race_key": "ggr2018", "team_id": 7, "yacht_then": "Olleanna", "note": "dismasted"}], "source": "https://goldengloberace.com/skippers/isa-rosli/"},
 {"yacht_2026": "Lazy Otter", "team_2026": 9, "design": "Rustler 36", "races": [{"race_key": "ggr2022", "team_id": 13, "yacht_then": "Lazy Otter", "note": "retired at Cape Town"}, {"race_key": "ggr2018", "team_id": 94, "yacht_then": "Lazy Otter", "note": "retired at A Coruña"}], "source": "https://goldengloberace.com/skippers/ertan-beskardes/"},
]

RETURNING = [
 {"team_2026": 6, "first": "Damien", "races": [{"race_key": "ggr2022", "team_id": 4}]},
 {"team_2026": 10, "first": "Pat", "races": [{"race_key": "ggr2022", "team_id": 5}]},
 {"team_2026": 17, "first": "Ertan", "races": [{"race_key": "ggr2022", "team_id": 13}, {"race_key": "ggr2018", "team_id": 94}]},
 {"team_2026": 5, "first": "Guy", "races": [{"race_key": "ggr2022", "team_id": 14}]},
]

# (name, kind, value, guard). kind "lat": the boat crosses this latitude southbound; "lon": eastbound, with the guard on latitude;
# "mark": YB's own distance to finish of a mark of the 2026 course (course.mark_togo), passed when the boat's distance to finish falls
# below it less the mark's margin; "finish": the documented finish.
MILESTONES = [("Lanzarote", "mark", "Lanzarote", None), ("Equator", "lat", 0.0, lambda lat, lon: -45 < lon < 0),
              ("Cape of Good Hope", "lon", 18.4731, lambda lat, lon: lat < -30), ("Hobart", "mark", "Hobart Gate", None),
              ("Cape Horn", "lon", -67.2667, lambda lat, lon: lat < -50), ("Finish", "finish", None, None)]

def ended(row):
    """The row's end time, or None for a boat still racing (every row of a past edition has ended)."""
    return row.get("ended_at")
