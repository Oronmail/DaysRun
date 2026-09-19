# worker/ggrstats/course.py
"""Which mark is next. Every mark of the course has a distance to finish of its own: the point of YB's course line nearest to
it (abeam, for a mark the fleet leaves hundreds of miles to one side). A boat has passed a mark once YB has shown it less
distance to finish than the mark's. That works for an inshore mark, an island left to port, a Southern Ocean waypoint left
to starboard and a cape alike, and needs no rule per mark. Pure functions on plain dicts."""
import math
from . import config
from .grid import bearing_deg          # one bearing rule for the whole worker; it is a pure angle, so YB's radius does not enter it

R_YB_NM = 3437.7468          # YB measures its course with one nautical mile per minute of arc: the sum of the course legs then
                             # equals RaceSetup's course.distance to a tenth of a mile (checked on the 2026 course, 25,754.5 nm)
MARGIN_OBSERVED_NM = 3.0     # a mark whose distance to finish was read off YB as boats passed it
MARGIN_COMPUTED_NM = 12.0    # a mark whose distance is the course sum: YB cuts bends (8 nm short at Lanzarote), so say it late, never early

# The corners the swept-bearing measure smooths: one row, and the licence to add another is narrow. Measured 19 Sep 2026.
# WHY: the nearest point of a polyline is DISCONTINUOUS for a boat inside a sharp concave corner. At the corner's bisector the foot of
# the perpendicular flips from the inbound arm to the outbound one, and the along-course value leaps by 2*D*cos(Phi/2) — 1.283 nm for
# every mile the boat is off the line. This year's course turns 82.29 deg at Trindade; the 2018 fleet, for which Trindade was no mark,
# ran 545 to 865 nm inside that turn, so Jean-Luc Van Den Heede's distance to finish fell 1,173.2 nm in one four-hour leg in which he
# sailed 23.0. Inside a wedge of H either side of the corner's bisector the boat is instead placed by the share of the bearing she has
# swept round the corner, between two values pinned to what the plain measure reads at the wedge's edges — exactly at the near edge,
# and within the bevel's own few miles at the far one (_swept).
# WHY A TABLE AND NOT A RULE: the same mechanism at every corner of the course was measured and REFUSED. It moves 59 of this year's
# 13,554 fixes away from YB's own distance to finish, the worst by 29.03 nm, because YB projects onto its own polyline and reproduces
# its own jumps — agreeing with the answer key to 0.07 nm means reproducing them; most of the "corners" it finds are hairpins spread
# over 40 to 50 nm, not points; and a shallow bend's wedge is so wide that a boat in the South Indian Ocean falls inside seven at once,
# whose answers differ by twenty thousand miles. Trindade is the one corner no fleet checked against YB can sail inside: NOR C.1.3
# leaves the island to port, which puts a boat on the course WEST of it, the convex side, where the wedge does not reach. Measured:
# 0 fixes of 2022 and 0 of 2026 move by one bit. A corner joins this table only when its bevel is under 10 nm, each arm a single great
# circle for 500 nm, its turn over 40 deg, no fleet checked against YB sails inside it, and no other row's wedge meets it.
CORNERS = [{"name": "Trindade", "apex": 88, "last": 89, "H": 40.0, "legs": 200, "turn": -82.287, "tol": 0.05}]
# apex: the node the bearing is swept about. last: the last turning node, 4.56 nm on, that completes the turn. H: the half-wedge in
# degrees — measured, H <= 44 leaves 2022 bit-identical and H >= 35 puts the residual at the fleets' own background, so 40 is the round
# number in the middle. legs: how far in leg index a fix may be from the apex, so that a boat coming home up the Atlantic (legs 428-442)
# is never caught by a wedge she passes through in bearing alone. turn/tol: what the course must really do at those nodes for the row
# to apply at all. Everything else — the two arms' bearings, the corner's own span of the course, C — is derived from the nodes.

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

def _corner(nodes, cum, row):
    """One row of CORNERS as the geometry the swept-bearing measure needs, derived from the course nodes at load time so that a
    course whose corner sits at another node index needs only that index changed. None when this course does not hold that corner —
    too short for the nodes, or its node no longer turns what the row declares — and then nothing is smoothed and the measure is
    today's, which is the safe direction to fail in; test_trindade.test_constants_come_from_the_course is the alarm that rings."""
    a, b = row["apex"], row["last"]
    if a < 1 or b + 1 >= len(nodes):
        return None
    brg = lambda i, j: bearing_deg(nodes[i]["lat"], nodes[i]["lon"], nodes[j]["lat"], nodes[j]["lon"])
    if abs(_wrap(brg(b, b + 1) - brg(a - 1, a)) - row["turn"]) > row["tol"]:
        return None
    alpha, beta = brg(a, a - 1), brg(a, b + 1)                       # back up the inbound arm, and on down the outbound one
    return {"name": row["name"], "apex": a, "legs": row["legs"], "lat": nodes[a]["lat"], "lon": nodes[a]["lon"],
            "alpha": alpha, "beta": beta, "s_apex": cum[a], "s_next": cum[b], "span": 2.0 * row["H"],
            "psi0": (alpha + beta) / 2.0 - row["H"],                 # the wedge runs from the bisector less H to the bisector plus H
            "c": math.cos(math.radians((beta - alpha) / 2.0 - row["H"]))}   # what cos(psi - ALPHA) is at the wedge's near edge

def _swept(c, lat, lon, i, total):
    """The swept-bearing distance to finish at corner `c`, or None to leave the plain measure alone — outside the wedge, or too far
    from the corner in leg index. Inside it the boat is given the corner's own span of the course in proportion to the bearing she
    has swept round it, from S_APEX - D*C at the near edge to S_NEXT + D*C at the far one. Those two are not fitted. The inbound
    arm is a single great circle from node ~55 to the apex, so the plain along-course value on that side is S_APEX - D*cos(psi -
    ALPHA); at the near edge psi - ALPHA is exactly (BETA - ALPHA)/2 - H, whose cosine is C. The near edge is therefore EXACT for
    any D, with no seam and no constant to tune. The far edge is not quite: BETA is the bearing to node 90 but the outbound arm
    begins at node 89, 4.563 nm off the apex, so the rule reads 3.8 - 0.0069*D nm further along there than the plain measure —
    a seam of a few miles, bounded by the bevel, against the 1,150 nm the rule removes (test_trindade.py names and pins it).
    Monotone for a boat rounding the corner either way, since D*C*(2x - 1) rises both while she closes the corner and while she
    opens it, and her swept bearing rises throughout."""
    if abs(i - c["apex"]) > c["legs"]:
        return None
    x = (bearing_deg(c["lat"], c["lon"], lat, lon) - c["psi0"]) % 360.0
    if not 0.0 < x < c["span"]:
        return None
    d = _gc(c["lat"], c["lon"], lat, lon) * c["c"]
    return total - (c["s_apex"] - d + x / c["span"] * (c["s_next"] - c["s_apex"] + 2.0 * d))

class Line:
    """YB's course as a polyline with its cumulative length, for measuring any point's distance to finish on THIS course: the
    past fleets sailed other courses, and YB's own figure for them is on those. The search runs forward from the leg the boat
    was on last time (back=3 legs, ahead=40), so a boat that turns back to port or crosses Storm Bay twice stays where it is.
    Inside the wedge of a corner in CORNERS the swept-bearing measure answers instead; everywhere else this is the same float it
    has always been. `corners=()` builds the plain line, which is what the tests measure the rule against."""
    def __init__(self, nodes, corners=None):
        self.nodes = nodes
        self.cum = _cumulative(nodes)
        self.total_nm = self.cum[-1]
        self.corners = [c for c in (_corner(nodes, self.cum, r) for r in (CORNERS if corners is None else corners)) if c]
    def togo(self, lat, lon, i0=0, back=3, ahead=40):
        i, t = _nearest(self.nodes, lat, lon, max(0, i0 - back), min(len(self.nodes) - 1, i0 + ahead))
        togo = self.total_nm - (self.cum[i] + t * (self.cum[i + 1] - self.cum[i]))
        for c in self.corners:
            s = _swept(c, lat, lon, i, self.total_nm)
            if s is not None:
                return s, i                                          # the leg index is the plain search's own: the corner moves the
        return togo, i                                               # figure, never where the next fix is looked for
