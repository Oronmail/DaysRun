# worker/ggrstats/config.py
"""Environment and race constants. Everything time-based is Unix seconds UTC."""
import os

RACE_KEY = os.getenv("GGR_RACE_KEY", "ggr2026")
START_AT = 1788697800                      # 2026-09-06 12:30:00 UTC, the gun (RaceSetup tags[].start)
DATABASE_URL = os.getenv("DATABASE_URL", "")
SNAPDIR = os.getenv("GGR_SNAPDIR", os.path.expanduser("~/ggr-snapshots"))
REVALIDATE_URL = os.getenv("REVALIDATE_URL", "")       # https://<site>/api/revalidate
REVALIDATE_SECRET = os.getenv("REVALIDATE_SECRET", "")
USER_AGENT = os.getenv("GGR_USER_AGENT", "daysrun/0.1 (unofficial fan statistics)")

LES_SABLES = (46.4964, -1.7947)            # marina, for restart detection
# The marks of the course in the order of NOR C.1.3 (name, lat, lon), positions from RaceSetup's points of interest
# ("Inshore Canary mark to Starboard", "Island of Trindade left to Port", "45S-40E left to Starboard", …). The Hobart Gate is the
# middle of its crossing line; the last mark is the finish. Which one is next: course.py.
MARKS = [("Lanzarote", 28.85335, -13.82092), ("Trindade", -20.50345, -29.32654),
         ("45°S 40°E", -45.0, 40.0), ("45°S 65°E", -45.0, 65.0), ("45°S 90°E", -45.0, 90.0), ("45°S 110°E", -45.0, 110.0),
         ("Cape Leeuwin", -34.37516, 115.14697), ("Hobart Gate", -42.98192, 147.33503), ("50°S 168°E", -50.0, 168.0),
         ("49°S 150°W", -49.0, -150.0), ("49°S 130°W", -49.0, -130.0), ("49°S 110°W", -49.0, -110.0), ("50°S 90°W", -50.0, -90.0),
         ("Cape Horn", -55.98355, -67.26667), ("Les Sables-d’Olonne", 46.48158, -1.79084)]
# YB's distance to finish as boats passed a mark, where it has been seen (nm). Lanzarote: 24,469.8 at 0.1 nm from the mark and
# 24,468.9 at 1.2 nm, on 16 Sep 2026. Add the next ones as the leader passes them: the fix nearest the mark, its dtf.
MARK_TOGO_OBSERVED = {"Lanzarote": 24469.5}
# Latitude sprints (name, from_lat, to_lat): time between crossing two parallels, southbound.
# Named by their parallels (45°N–40°N is off Galicia and Portugal, not the Bay of Biscay, which ends at Finisterre).
SPRINTS = [("45°N–40°N", 45.0, 40.0), ("40°N–35°N", 40.0, 35.0), ("35°N–30°N", 35.0, 30.0),
           ("30°N–Equator", 30.0, 0.0), ("Equator–40°S", 0.0, -40.0)]
GHOSTS = {978: "Van Den Heede 2018", 940: "Neuschäfer 2022", 957: "Knox-Johnston 1968", 985: "Moitessier 1968"}


def race_start(setup):
    """The race's start, from YB's RaceSetup: the earliest start of the tags we can read, else the earliest of the boats.
    YB adds and changes tags in the middle of a race (18 Sep 2026: a Chichester Class tag appeared, and a leaderboard tag with no
    `teams` key stopped every worker run), so a tag without a `start` is ignored rather than fatal."""
    starts = [t["start"] for t in setup.get("tags", []) if t.get("start") is not None]
    if not starts:
        starts = [t["start"] for t in setup.get("teams", []) if t.get("start") is not None]
    if not starts:
        raise ValueError("RaceSetup carries no start time, on a tag or on a boat")
    return min(starts)


# A class the race has announced but YB has not yet put in its own data. Each entry names its source and its date, and counts for
# nothing the moment YB's tag says the same; delete it then. NOR C.2.2 leaves the decision to the GGR Director or Chairman, so the
# only sources allowed here are the race's own: nothing goes in on an inference of ours, however plain the tracker makes it.
# 5 = Guy deBoer: the Golden Globe Race announced on its own account on 18 Sep 2026 that he moves to the Chichester class after
# stopping at Marina Rubicon, Lanzarote, for repairs (a damaged port lower chainplate lifting and cracking the deck).
CLASS_OVERRIDE = {5: "Chichester"}
