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
# Marks in course order for the ETA logic (name, lat, lon). Lanzarote from RaceSetup poi
# "Inshore Canary mark to Starboard"; Trindade from poi "Island of Trindade left to Port".
MARKS = [("Lanzarote", 28.85335, -13.82092), ("Trindade", -20.50345, -29.32654)]
# Latitude sprints (name, from_lat, to_lat): time between crossing two parallels, southbound.
# Named by their parallels (45°N–40°N is off Galicia and Portugal, not the Bay of Biscay, which ends at Finisterre).
SPRINTS = [("45°N–40°N", 45.0, 40.0), ("40°N–35°N", 40.0, 35.0), ("35°N–30°N", 35.0, 30.0),
           ("30°N–Equator", 30.0, 0.0), ("Equator–40°S", 0.0, -40.0)]
GHOSTS = {978: "Van Den Heede 2018", 940: "Neuschäfer 2022", 957: "Knox-Johnston 1968", 985: "Moitessier 1968"}
