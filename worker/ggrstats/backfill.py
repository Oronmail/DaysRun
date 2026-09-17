# worker/ggrstats/backfill.py
"""Import an existing archive of snapshots so history starts on 6 Sep 2026, then derive every 4-hour snapshot since.
The archive holds: a merged master track (AllPositions3.master.json.gz) and timestamped gz snapshots of every endpoint."""
import gzip, json, pathlib, re
from datetime import datetime, timezone
from . import db, decode
from .grid import SLOT_S

STAMP = re.compile(r"\.(\d{8}T\d{4})\.gz$")

def snapshot_stamp(path):
    m = STAMP.search(pathlib.Path(path).name)
    return int(datetime.strptime(m.group(1), "%Y%m%dT%H%M").replace(tzinfo=timezone.utc).timestamp())

def slots_between(start_at, end_at):
    first = (start_at // SLOT_S + 1) * SLOT_S
    return list(range(first, end_at + 1, SLOT_S))

def import_archive(conn, race, master_gz, snapshots_dir):
    counts = {"master_fixes": 0, "snapshots": 0, "snapshot_fixes": 0, "leaderboards": 0, "splits": 0}
    teams = json.load(gzip.open(master_gz))
    counts["master_fixes"] = db.insert_fixes(conn, race, teams)
    snapdir = pathlib.Path(snapshots_dir)
    for p in sorted(snapdir.glob("AllPositions3.*.gz")):
        counts["snapshot_fixes"] += db.insert_fixes(conn, race, decode.decode(gzip.open(p).read()))
        counts["snapshots"] += 1
    for p in sorted(snapdir.glob("leaderboard.*.gz")):
        db.insert_leaderboard(conn, race, snapshot_stamp(p), json.load(gzip.open(p)))
        counts["leaderboards"] += 1
    zeg = sorted(snapdir.glob("zegments.*.gz"))
    if zeg:
        db.upsert_splits(conn, race, json.load(gzip.open(zeg[-1])))
        counts["splits"] = 1
    conn.commit()
    return counts
