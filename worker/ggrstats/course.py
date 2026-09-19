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
# NO PAGE OF THE SITE READS THIS TODAY. It was built so that the fleets of 2018 and 2022 could be projected onto this year's
# course line and compared mile for mile; that common yardstick was abandoned the same day (the-measure-changed.md), and every
# fleet now keeps YB's own distance to finish on its own course. The table and its tests stay because they are the record of why
# — a polyline's nearest point is discontinuous, so the projection could never make two fleets agree — and the only way back.
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
CORNERS = [{"name": "Trindade", "apex": 88, "last": 89, "H": 40.0, "legs": 200, "turn": -82.287, "tol": 0.05, "bevel": 10.0, "straight": 0.05}]
# apex: the node the bearing is swept about, and the last node of the inbound arm. last: the first node of the OUTBOUND arm, 4.56 nm on,
# where the turn is complete. H: the half-wedge in degrees — measured, H <= 44 leaves 2022 bit-identical and H >= 35 puts the residual at
# the fleets' own background, so 40 is the round number in the middle. legs: how far in leg index a fix may be from the apex, so that a
# boat coming home up the Atlantic (legs 428-442) is never caught by a wedge she passes through in bearing alone. The last four are the
# admission criteria of the measurement, asserted on the course before the row is allowed to apply at all: turn/tol, how sharply those
# nodes must really turn; bevel, the longest along-course gap between the two arms a point corner may have (10 nm); straight, how far the
# bearing to a node further along an arm may drift from the bearing to the first (0.05 deg), which is what "each arm is a single great
# circle" means. Everything else — the arms' bearings, the apex's own foot on each arm, C — is derived from the nodes at load time.

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
    too short for the nodes, the nodes out of order, or the course failing any admission criterion the row asserts — and then
    nothing is smoothed and the measure is the plain nearest point, which is the safe direction to fail in. No page reads this
    measure any more, so nothing published can move when a row drops out; what pins the geometry is
    test_trindade.test_constants_come_from_the_course, against the fixture."""
    a, b = row["apex"], row["last"]
    if a < 3 or b <= a or b + 3 >= len(nodes):                       # the arms need three nodes each to be checked for straightness
        return None
    brg = lambda i, j: bearing_deg(nodes[i]["lat"], nodes[i]["lon"], nodes[j]["lat"], nodes[j]["lon"])
    straight = lambda i, step: all(abs(_wrap(brg(i, i + step * k) - brg(i, i + step))) <= row["straight"] for k in (2, 3))
    if abs(_wrap(brg(b, b + 1) - brg(a - 1, a)) - row["turn"]) > row["tol"]:
        return None                                                  # these nodes do not turn what the row says they turn
    if cum[b] - cum[a] > row["bevel"] or not (straight(a, -1) and straight(b, 1)):
        return None                                                  # a hairpin spread over miles, or an arm that is not one great circle
    alpha, beta = brg(a, a - 1), brg(b, b + 1)                       # back up the inbound arm, and on down the outbound one from ITS OWN first node
    gamma, bevel = brg(a, b), _gc(nodes[a]["lat"], nodes[a]["lon"], nodes[b]["lat"], nodes[b]["lon"])
    sweep = (beta - alpha) % 360.0                                   # the concave sector, swept clockwise from one arm to the other
    return {"name": row["name"], "apex": a, "legs": row["legs"], "lat": nodes[a]["lat"], "lon": nodes[a]["lon"],
            "alpha": alpha, "beta": beta, "gamma": gamma, "bevel": bevel, "span": 2.0 * row["H"],
            "s_in": cum[a],                                          # the apex's own foot on the inbound arm: the apex itself
            "s_out": cum[b] - bevel * math.cos(math.radians(_wrap(gamma - beta))),   # and its foot on the outbound arm, which starts at node b
            "psi0": alpha + sweep / 2.0 - row["H"],                  # the wedge runs from the bisector less H to the bisector plus H
            "c": math.cos(math.radians(sweep / 2.0 - row["H"]))}     # cos(PSI0 - ALPHA), and equally cos(BETA - PSI1): the two edges are one angle

def _swept(c, lat, lon, i, total):
    """The swept-bearing distance to finish at corner `c`, or None to leave the plain measure alone — outside the wedge, or too far
    from the corner in leg index. Inside it the boat is given the corner's own span of the course in proportion to the bearing she
    has swept round it, from S_IN - D*C at the near edge to S_OUT + D*C at the far one. Those two are not fitted, and they are
    symmetric. Each arm is a single great circle (_corner checks it), so the plain along-course value of a boat at (D, psi) is
    S_IN - D*cos(psi - ALPHA) on the inbound side and S_OUT + D*cos(BETA - psi) on the outbound one, where S_IN and S_OUT are the
    APEX's OWN FEET on the two arms — the apex lies on the inbound arm, and is one bevel short of the outbound one, which is what
    S_OUT subtracts. At the near edge psi - ALPHA is exactly sweep/2 - H, and at the far edge BETA - psi is the same angle, whose
    cosine is C. So the rule meets the plain measure at BOTH edges, for any D, with no seam and no constant to tune. It is monotone
    for a boat rounding the corner either way, since D*C*(2x - 1) rises both while she closes the corner and while she opens it,
    and her swept bearing rises throughout."""
    if abs(i - c["apex"]) > c["legs"]:
        return None
    x = (bearing_deg(c["lat"], c["lon"], lat, lon) - c["psi0"]) % 360.0
    if not 0.0 < x < c["span"]:
        return None
    d = _gc(c["lat"], c["lon"], lat, lon) * c["c"]
    return total - (c["s_in"] - d + x / c["span"] * (c["s_out"] - c["s_in"] + 2.0 * d))

class Line:
    """YB's course as a polyline with its cumulative length, for measuring any point's distance to finish on THIS course. It was
    built to put the past fleets on this year's course line; that comparison is retired (editions.on_line) and no page reads the
    class today — it stays with its tests as the record of why one yardstick could not be had, and as the way back to it.
    The search runs forward from the leg the boat was on last time (back=3 legs, ahead=40), so a boat that turns back to port or
    crosses Storm Bay twice stays where it is.
    Inside the wedge of a corner in CORNERS the swept-bearing measure answers instead; everywhere else this is the same float it
    has always been. `corners=()` builds the plain line, which is what the tests measure the rule against."""
    def __init__(self, nodes, corners=None):
        self.nodes = nodes
        self.cum = _cumulative(nodes)
        self.total_nm = self.cum[-1]
        self.corners = [c for c in (_corner(nodes, self.cum, r) for r in (CORNERS if corners is None else corners)) if c]
    def adjusts(self, lat, lon, i):
        """Would a corner move the plain measure for a fix at (lat, lon) whose forward search landed on leg `i`? Kept with the
        measure itself: while the past fleets were projected onto this year's line, the worker counted this over the LIVE fleet on
        every derive, because those figures are YB's own and are checked against YB to 0.07 nm, so smoothing one would have been a
        disagreement with the answer key by construction. Nothing is projected now, so nothing counts it."""
        return any(_swept(c, lat, lon, i, self.total_nm) is not None for c in self.corners)
    def togo(self, lat, lon, i0=0, back=3, ahead=40):
        i, t = _nearest(self.nodes, lat, lon, max(0, i0 - back), min(len(self.nodes) - 1, i0 + ahead))
        togo = self.total_nm - (self.cum[i] + t * (self.cum[i + 1] - self.cum[i]))
        for c in self.corners:
            s = _swept(c, lat, lon, i, self.total_nm)
            if s is not None:
                return s, i                                          # the leg index is the plain search's own: the corner moves the
        return togo, i                                               # figure, never where the next fix is looked for
