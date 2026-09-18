# worker/ggrstats/course.py
"""Which mark is next. Every mark of the course has a distance to finish of its own: the point of YB's course line nearest to
it (abeam, for a mark the fleet leaves hundreds of miles to one side). A boat has passed a mark once YB has shown it less
distance to finish than the mark's. That works for an inshore mark, an island left to port, a Southern Ocean waypoint left
to starboard and a cape alike, and needs no rule per mark. Pure functions on plain dicts."""
import math
from . import config

R_YB_NM = 3437.7468          # YB measures its course with one nautical mile per minute of arc: the sum of the course legs then
                             # equals RaceSetup's course.distance to a tenth of a mile (checked on the 2026 course, 25,754.5 nm)
MARGIN_OBSERVED_NM = 3.0     # a mark whose distance to finish was read off YB as boats passed it
MARGIN_COMPUTED_NM = 12.0    # a mark whose distance is the course sum: YB cuts bends (8 nm short at Lanzarote), so say it late, never early

def _gc(lat1, lon1, lat2, lon2):
    p1, l1, p2, l2 = map(math.radians, (lat1, lon1, lat2, lon2))
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin((l2 - l1) / 2) ** 2
    return 2 * R_YB_NM * math.asin(math.sqrt(a))

def _wrap(deg):
    return (deg + 180.0) % 360.0 - 180.0

def _cumulative(nodes):
    cum = [0.0]
    for a, b in zip(nodes, nodes[1:]):
        cum.append(cum[-1] + _gc(a["lat"], a["lon"], b["lat"], b["lon"]))
    return cum

def course_length_nm(nodes):
    return _cumulative(nodes)[-1]

def _nearest(nodes, lat, lon, lo, hi):
    """(leg index, fraction along it) of the point of legs `lo` to `hi - 1` nearest (lat, lon): flat earth centred on the
    position, fine for finding the nearest leg over a span this short. A tie goes to the earlier leg, so a search that
    starts further back than it needs to (mark_togo's own leg, Line.togo's `back`) never gets pulled forward by it. Shared
    by `mark_togo` (mark-order search, monotonic `lo`) and `Line.togo` (fix-order search, a small window around `i0`), so
    the nearest-leg rule is written once."""
    k, best = math.cos(math.radians(lat)), None
    for i in range(lo, hi):
        a, b = nodes[i], nodes[i + 1]
        ax, ay = _wrap(a["lon"] - lon) * k, a["lat"] - lat
        bx, by = _wrap(b["lon"] - lon) * k, b["lat"] - lat
        dx, dy = bx - ax, by - ay
        t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, (-ax * dx - ay * dy) / (dx * dx + dy * dy)))
        d = math.hypot(ax + t * dx, ay + t * dy)
        if best is None or d < best[0]:
            best = (d, i, t)
    if best is None:
        raise ValueError(f"no leg in range [{lo}, {hi})")
    return best[1], best[2]

def mark_togo(nodes, marks, observed=None):
    """{mark name: distance to finish in nm}. Each mark is looked for from the previous mark's leg onward, so that the start
    and the finish (the same water) and the way into and out of Storm Bay are never confused. The last mark is the finish: 0.
    `observed` overrides the computed value where YB's own figure at the mark is known (config.MARK_TOGO_OBSERVED)."""
    observed = config.MARK_TOGO_OBSERVED if observed is None else observed
    cum = _cumulative(nodes)
    total, start, out = cum[-1], 0, {}
    for name, lat, lon in marks[:-1]:
        i, t = _nearest(nodes, lat, lon, start, len(nodes) - 1)
        start = i
        out[name] = observed.get(name, total - (cum[i] + t * (cum[i + 1] - cum[i])))
    out[marks[-1][0]] = 0.0
    return out

def next_mark(min_dtf_nm, marks, togo, observed=None):
    """(name, lat, lon) of the first mark not yet passed, given the least distance to finish YB has shown for the boat."""
    observed = config.MARK_TOGO_OBSERVED if observed is None else observed
    for m in marks[:-1]:
        margin = MARGIN_OBSERVED_NM if m[0] in observed else MARGIN_COMPUTED_NM
        if min_dtf_nm >= togo[m[0]] - margin:
            return m
    return marks[-1]

def order(name):
    """A mark's place in the course, for telling forward from backward; -1 for a name that is not a mark."""
    return next((i for i, m in enumerate(config.MARKS) if m[0] == name), -1)

class Line:
    """YB's course as a polyline with its cumulative length, for measuring any point's distance to finish on THIS course: the
    past fleets sailed other courses, and YB's own figure for them is on those. The search runs forward from the leg the boat
    was on last time (back=3 legs, ahead=40), so a boat that turns back to port or crosses Storm Bay twice stays where it is."""
    def __init__(self, nodes):
        self.nodes = nodes
        self.cum = _cumulative(nodes)
        self.total_nm = self.cum[-1]
    def togo(self, lat, lon, i0=0, back=3, ahead=40):
        i, t = _nearest(self.nodes, lat, lon, max(0, i0 - back), min(len(self.nodes) - 1, i0 + ahead))
        return self.total_nm - (self.cum[i] + t * (self.cum[i + 1] - self.cum[i])), i
