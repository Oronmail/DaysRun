# worker/tests/test_trindade.py — the swept-bearing measure at the Trindade corner (course.CORNERS), measured 19 Sep 2026.
# The rule exists because the nearest point of a polyline is DISCONTINUOUS inside a sharp concave corner, and the 2018 fleet
# sailed hundreds of miles inside this year's Trindade dog-leg. It must be a no-op everywhere else, and these tests are what
# says so: the 2026 answer key and the whole 2022 fixture must come back as the SAME FLOAT, not "within a tolerance".
import gzip, json, math, pathlib
from ggrstats import course, editions, editions_data
from ggrstats.grid import gc_nm

FIX = pathlib.Path(__file__).parent / "fixtures"
NODES = json.load(open(FIX / "RaceSetup.20260916.json"))["course"]["nodes"]
LINE = course.Line(NODES)                                       # the swept-bearing measure, as the site now reads it
PLAIN = course.Line(NODES, corners=())                          # the same line with the corner table empty: today's measure
TRINDADE = LINE.corners[0]
APEX = (NODES[88]["lat"], NODES[88]["lon"])
PSI0, PSI1 = TRINDADE["psi0"], TRINDADE["psi0"] + TRINDADE["span"]

def _dest(brg, nm):
    """The point nm miles from the corner on the initial bearing brg, on YB's own radius: the inverse of course._gc and
    grid.bearing_deg, so a synthetic boat sits at an exact (bearing, range) from the corner — the two quantities the rule reads."""
    p1, l1, b, d = math.radians(APEX[0]), math.radians(APEX[1]), math.radians(brg), nm / course.R_YB_NM
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(b))
    l2 = l1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2))
    return math.degrees(p2), course._wrap(math.degrees(l2))

def parallel_track(nm, inside, reach=1200.0, leg=20.0):
    """A synthetic boat sailing parallel to the course at `nm` off it, from `reach` miles before the corner to `reach` after, in
    `leg`-mile steps (about one 4-hour leg). Both arms are single great circles, so the parallel track is two lines meeting at
    their own corner, `nm`/sin(half the concave angle) from the course's corner along the bisector; each point is then placed at
    its exact bearing and range from the corner, which is what makes "how far off the line" and "how far round" say what they
    mean. inside True is the concave side, where the 2018 fleet ran; inside False is the convex side the NOR puts a boat on by
    requiring Trindade to be left to port."""
    a, b = math.radians(TRINDADE["alpha"]), math.radians(TRINDADE["beta"])
    p = (nm if inside else -nm) / math.sin((b - a) / 2.0)
    px, py = p * math.sin((a + b) / 2.0), p * math.cos((a + b) / 2.0)
    n = int(reach / leg)
    xy = [(px + (n - k) * leg * math.sin(a), py + (n - k) * leg * math.cos(a)) for k in range(n)]      # in on the inbound arm
    xy += [(px + k * leg * math.sin(b), py + k * leg * math.cos(b)) for k in range(n + 1)]             # her corner, then out
    return [_dest(math.degrees(math.atan2(x, y)), math.hypot(x, y)) for x, y in xy]

def walk(line, track, i0=0, ahead=200):
    """The distance to finish at every point of a synthetic track, searched forward as editions.on_line searches."""
    out = []
    for lat, lon in track:
        togo, i0 = line.togo(lat, lon, i0, ahead=ahead)
        out.append(togo)
    return out

def worst_leg(track, walked):
    """The largest one-leg anomaly: how much further the distance to finish fell than the boat sailed between the two points."""
    return max((walked[k] - walked[k + 1]) - gc_nm(track[k][0], track[k][1], track[k + 1][0], track[k + 1][1])
               for k in range(len(track) - 1))

_PREPARED = {}
def prepared(race):
    """Every sampled boat of a past race, cut at its documented end and measured on the 2026 line under BOTH measures. No page
    does this any more (the fleets keep YB's own distance on their own courses); the projection is built here, in the tests that
    are the record of why it was abandoned."""
    if race not in _PREPARED:
        start = editions_data.EDITIONS[race]["start"]
        sample = {t["id"]: sorted(t["moments"], key=lambda m: m["at"]) for t in json.load(gzip.open(FIX / f"{race}.sample.json.gz", "rt"))}
        on = lambda fx, line, ended_at: editions.on_line(editions.fill_slots(editions.cut(fx, ended_at)), line)
        _PREPARED[race] = {r["id"]: {m: editions.prepare(on(sample[r["id"]], l, r["ended_at"]), start, r["ended_at"], r["ended_how"])
                                     for m, l in (("rounded", LINE), ("plain", PLAIN))}
                           for r in editions_data.TEAMS[race] if r["id"] in sample}
    return _PREPARED[race]

# ---------------------------------------------------------------- the constants, and that they come from the course

def test_constants_come_from_the_course():
    """Every number the rule uses is derived from the 2026 nodes at load time, never stored: a course whose corner moves needs
    only the node indices in course.CORNERS changed. Pinned to the measurement of 19 Sep 2026, so that a RaceSetup which moves
    the corner fails here, loudly, instead of quietly smoothing the wrong water."""
    brg = lambda i, j: course.bearing_deg(NODES[i]["lat"], NODES[i]["lon"], NODES[j]["lat"], NODES[j]["lon"])
    assert abs(course._wrap(brg(88, 89) - brg(87, 88)) + 48.89) < 0.01          # node 88 turns 48.89 deg to port
    assert abs(course._wrap(brg(89, 90) - brg(87, 88)) + 82.29) < 0.01          # the corner's whole turn, over a 4.56 nm bevel
    assert abs(TRINDADE["bevel"] - 4.56316) < 1e-4 and abs(TRINDADE["gamma"] - 147.35610) < 1e-5
    assert abs(TRINDADE["alpha"] - 16.33904) < 1e-5                             # back up the inbound arm, from the apex
    assert abs(TRINDADE["beta"] - 113.96174) < 1e-5                             # on down the outbound arm, from ITS first node, 89
    assert abs(TRINDADE["s_in"] - 4379.7087) < 1e-4                             # the apex's foot on the inbound arm: the apex itself
    assert abs(TRINDADE["s_out"] - 4380.4621) < 1e-4                            # and on the outbound arm, one bevel back from node 89
    assert abs(TRINDADE["c"] - 0.988198) < 1e-6
    assert abs(PSI0 - 25.15039) < 1e-5 and abs(PSI1 - 105.15039) < 1e-5
    assert abs(LINE.total_nm - 25754.5239) < 1e-3 and LINE.total_nm == PLAIN.total_nm

def test_the_two_edges_of_the_wedge_are_one_angle():
    """The construction is symmetric, and this is what that means: the angle between the near edge and the arm it leaves, and the
    angle between the far edge and the arm it meets, are the SAME angle — sweep/2 - H = 8.81135 deg — so one cosine, C, serves
    both. Anything that broke the symmetry (measuring the outbound arm from the apex rather than from its own first node, as the
    design's section 5 did) would show up here as two different numbers."""
    import math
    assert abs(math.cos(math.radians(PSI0 - TRINDADE["alpha"])) - TRINDADE["c"]) < 1e-12
    assert abs(math.cos(math.radians(TRINDADE["beta"] - PSI1)) - TRINDADE["c"]) < 1e-12
    assert abs((PSI0 - TRINDADE["alpha"]) - 8.81135) < 1e-5 and abs((TRINDADE["beta"] - PSI1) - 8.81135) < 1e-5

def test_the_corner_table_holds_trindade_and_nothing_else():
    """One row, by design. The same mechanism at every corner of the course was measured and refused: it moves 59 of this
    year's 13,554 fixes away from YB's own figure, the worst by 29.03 nm, because YB projects onto its own polyline and
    reproduces its own jumps. Trindade is the only corner no fleet checked against YB can sail inside (NOR C.1.3)."""
    assert [c["name"] for c in course.CORNERS] == ["Trindade"]
    assert len(LINE.corners) == 1 and LINE.corners[0]["name"] == "Trindade"

def test_a_course_that_fails_any_admission_criterion_is_not_smoothed():
    """The row names node indices; the code asserts on the course itself that those nodes really are the corner the row describes,
    before it smooths anything. Every criterion is exercised here, because a row applied to the wrong water is far worse than a row
    that does not apply at all. Failing quietly is the safe direction: no page reads this measure now, so nothing published can
    move when a row drops out, and this test is what pins the geometry against the fixture."""
    row = dict(course.CORNERS[0])
    bend = lambda **kw: course.Line(NODES, corners=[dict(row, **kw)]).corners
    assert bend() and bend()[0]["name"] == "Trindade"                            # the real course, unmodified: the row applies
    assert course.Line([{"lat": 46.5, "lon": -1.79}, {"lat": 0.0, "lon": -1.79}]).corners == []            # too short for the nodes
    assert course.Line([{"lat": 46.5 - i * 0.5 / 60.0, "lon": -1.79} for i in range(201)]).corners == []   # 201 nodes, but no turn
    assert bend(last=87) == [] and bend(last=88) == []                           # `last` must follow `apex`, or the interpolation inverts
    assert bend(apex=87) == [] and bend(apex=89) == []                           # the wrong node does not turn what the row declares
    assert bend(bevel=4.0) == []                                                 # the bevel is 4.563 nm: a tighter limit refuses it
    assert bend(last=92) == []                                                   # a "corner" spread over 162 nm is a hairpin, not a point
    assert bend(straight=0.0) == []                                              # an arm must be one great circle, to the row's tolerance

# ---------------------------------------------------------------- the wedge: its edges, its inside, and everything outside it

def _edge_gap(psi, d):
    """How far the rule's reading at (psi, D) is from the plain measure's, in nm — positive when the rule reads more to go."""
    lat, lon = _dest(psi, d)
    return LINE.togo(lat, lon, 88, back=88, ahead=120)[0] - PLAIN.togo(lat, lon, 88, back=88, ahead=120)[0]

def test_both_edges_meet_the_plain_measure():
    """The property the whole rule rests on, and it holds at BOTH edges because the construction is symmetric. Each arm is a
    single great circle, so the plain along-course value of a boat at (D, psi) is S_IN - D*cos(psi - ALPHA) on the inbound side
    and S_OUT + D*cos(BETA - psi) on the outbound one, where S_IN and S_OUT are the apex's own feet on the two arms; at each edge
    that cosine is C, which is exactly what the rule returns for x = 0 and x = 1. Nothing is fitted and no constant tunes the
    joins.

    THE BOUNDS ARE STATED BY RANGE FROM THE APEX, which is what the rule reads — not by offset from the line, which is a different
    quantity. Real adjusted fixes reach D = 1,854 nm (full 2018 fleet, 19 Sep 2026), so the bounds go to 1,900. The residual is
    the flat-earth frame the existing _nearest already uses, and it grows with D: measured, the near edge is 0.000 nm out to
    D = 5, -0.03 at 100, -0.10 at 300, -0.74 at 900, -1.89 at 1,500 and -2.83 at 1,900. The far edge is within 1.3 nm out to
    D = 900 (the 1.0 to 1.3 nm at D = 1 and 2 is the plain measure clamping to the 4.56 nm bevel leg, inside which no arm exists),
    and is not asserted beyond 900 because the outbound arm itself is only one great circle for 992 nm — see the next test."""
    for d in (1, 2, 5, 20, 50, 100, 300):
        assert abs(_edge_gap(PSI0 + 1e-6, d)) < 0.11, (d, _edge_gap(PSI0 + 1e-6, d))
    for d in (600, 900):
        assert abs(_edge_gap(PSI0 + 1e-6, d)) < 0.8, (d, _edge_gap(PSI0 + 1e-6, d))
    for d in (1200, 1500, 1800, 1900):
        assert abs(_edge_gap(PSI0 + 1e-6, d)) < 3.0, (d, _edge_gap(PSI0 + 1e-6, d))
    for d in (1, 2, 5, 20, 50, 100, 300, 600, 900):
        assert abs(_edge_gap(PSI1 - 1e-6, d)) < 1.3, (d, _edge_gap(PSI1 - 1e-6, d))

def test_the_arms_are_single_great_circles_and_the_rule_reaches_no_further():
    """The construction's premise, pinned, because the rule extrapolates each arm as a straight line for as far as the wedge
    reaches. Measured on the 2026 course: the INBOUND arm is one great circle from the apex back 2,646 nm (to node 38) and breaks
    at node 37; the OUTBOUND arm is one great circle for 992 nm (to node 108) and breaks at node 109. Beyond 992 nm along the
    outbound arm the rule's far edge is extrapolating past a bend and its reading parts company with the plain measure — measured,
    -19 nm at D = 1,200 and -70 nm at D = 1,800.

    THAT IS NOT REACHABLE BY A BOAT, and this is why it is documented rather than bounded. To sit at the far edge 1,200 nm out is
    to be 1,200 nm ESE of Trindade, deep towards Africa, and still measured against this corner. Measured over all 790 adjusted
    fixes of the 2018 fleet: every fix beyond D = 1,200 nm has swept at most 14.0 deg of the wedge's 80, and every fix beyond
    D = 1,600 at most 8.7 — they are boats near the Equator, far SHORT of the corner up the long inbound arm, not out on the
    short outbound one. If a future course shortens the inbound arm or a future fleet sails the other quadrant, this test is
    where that shows up."""
    brg = lambda i, j: course.bearing_deg(NODES[i]["lat"], NODES[i]["lon"], NODES[j]["lat"], NODES[j]["lon"])
    drift = lambda i, j, k: abs(course._wrap(brg(i, j) - brg(i, k)))
    assert all(drift(88, j, 87) < 1e-4 for j in range(38, 88)) and drift(88, 37, 87) > 0.05      # inbound: nodes 38 to 87, then a bend
    assert all(drift(89, j, 90) < 1e-4 for j in range(91, 109)) and drift(89, 109, 90) > 0.05    # outbound: nodes 90 to 108, then a bend
    cum = course._cumulative(NODES)
    assert abs((cum[88] - cum[38]) - 2646) < 1 and abs((cum[108] - cum[89]) - 992) < 1

def test_no_step_across_either_edge_of_the_wedge():
    """A boat crossing an edge sees no step worth the name: measured a ten-thousandth of a degree either side, so that what is
    measured is the seam itself and not the boat's own progress. The bound is the same flat-earth residual as the test above, and
    it is stated by range from the apex: a tenth of a mile to D = 300, under a mile to 900, under three miles to 1,900 at the near
    edge; under 1.3 nm to 900 at the far edge. Before the symmetry was corrected on 19 Sep 2026 the far edge stepped by 4.8 nm."""
    step = lambda edge, d: abs(LINE.togo(*_dest(edge - 1e-4, d), 88, back=88, ahead=200)[0]
                               - LINE.togo(*_dest(edge + 1e-4, d), 88, back=88, ahead=200)[0])
    for d in (1, 5, 50, 300):
        assert step(PSI0, d) < 0.11, (d, step(PSI0, d))
    for d in (600, 900):
        assert step(PSI0, d) < 0.8, (d, step(PSI0, d))
    for d in (1200, 1500, 1900):
        assert step(PSI0, d) < 3.0, (d, step(PSI0, d))
    for d in (1, 5, 50, 300, 600, 900):
        assert step(PSI1, d) < 1.3, (d, step(PSI1, d))

def test_outside_the_wedge_is_bit_identical():
    """Outside the wedge the rule returns the plain value itself, not a value near it: the same float."""
    n = 0
    for psi in [p * 5.0 for p in range(72)]:
        if PSI0 < psi < PSI1:
            continue
        for d in (1, 10, 100, 500, 1500):
            lat, lon = _dest(psi, d)
            assert LINE.togo(lat, lon, 88, back=88, ahead=200)[0] == PLAIN.togo(lat, lon, 88, back=88, ahead=200)[0], (psi, d)
            n += 1
    assert n > 200

def test_far_from_the_corner_in_leg_index_is_bit_identical():
    """The leg gate. A boat coming home up the Atlantic passes through the wedge in bearing while she is 340 legs past the
    corner; 88 +/- 200 legs separates the two passages by about 7,000 nm of course and is never near a boundary in between."""
    lat, lon = _dest(PSI0 + TRINDADE["span"] / 2, 400.0)
    assert LINE.togo(lat, lon, 88, back=88, ahead=200)[0] != PLAIN.togo(lat, lon, 88, back=88, ahead=200)[0]
    assert LINE.togo(lat, lon, 430, back=0, ahead=40)[0] == PLAIN.togo(lat, lon, 430, back=0, ahead=40)[0]

# ---------------------------------------------------------------- a synthetic boat either side of the corner

def test_west_of_the_island_is_a_no_op():
    """The convex side, where NOR C.1.3 puts every boat sailing this year's course: not a small shift, exactly nought."""
    for nm in (1, 2, 5, 20, 50, 100, 300, 600, 900):
        track = parallel_track(nm, inside=False)
        assert walk(LINE, track) == walk(PLAIN, track), nm

def test_no_jump_inside_the_corner():
    """The concave side, where the 2018 fleet ran. The plain measure's one-leg anomaly grows without limit with the offset
    (2*D*cos(Phi/2) = 1.283*D at the bisector, and a parallel track crosses the bisector 1.30 offsets out); the rule holds it
    to a few miles at every offset from 2 to 900 nm."""
    for nm in (2, 5, 10, 20, 40, 60, 100, 150, 300, 600, 900):
        track = parallel_track(nm, inside=True)
        rounded, plain = worst_leg(track, walk(LINE, track)), worst_leg(track, walk(PLAIN, track))
        assert rounded < 15.0, (nm, rounded)
        if nm >= 40:
            assert plain > 10 * rounded, (nm, plain, rounded)
    assert worst_leg(parallel_track(900, True), walk(PLAIN, parallel_track(900, True))) > 1000.0

def test_monotone_across_the_corner():
    """A boat sailing round the corner never goes backwards on the line under the rule: the interpolation rises both while she
    closes the corner (x < 1/2) and while she opens it (x > 1/2), and her swept bearing rises throughout."""
    for nm in (2, 20, 100, 300, 900):
        walked = walk(LINE, parallel_track(nm, inside=True))
        assert min(a - b for a, b in zip(walked, walked[1:])) > -0.5, nm

# ---------------------------------------------------------------- the three fleets

def test_2026_fleet_is_bit_identical_under_the_rule():
    """The regression that protects the 0.07 nm median against YB's own distance to finish. Every moment of the master fixture,
    the same float under both measures — the clause that would have caught the general form of this rule, which fails it on
    59 fixes, the worst by 29.03 nm."""
    n = 0
    for t in json.load(gzip.open(FIX / "AllPositions3.master.20260916T0230.json.gz")):
        if t["id"] in editions_data.EDITIONS["ggr2026"]["skip"]: continue
        i0 = j0 = 0
        for m in sorted(t["moments"], key=lambda m: m["at"]):
            if not m.get("dtf"): continue
            a, i0 = LINE.togo(m["lat"], m["lon"], i0)
            b, j0 = PLAIN.togo(m["lat"], m["lon"], j0)
            assert a == b and i0 == j0, (t["id"], m["at"], a, b)
            n += 1
    assert n > 13000

def test_2022_fleet_is_bit_identical_under_the_rule():
    """Not one 2022 fix lies in the wedge on the outbound passage, and the reason is structural, not luck: the NOR requires
    Trindade to be left to port, so a boat heading 196 deg passes WEST of it — the convex side, where the wedge does not reach.
    Every boat of the whole 2022 fleet crossed 20 deg 30' S west of the corner, by 0.2 to 205 nm.

    The comparison is on the RAW float Line.togo returns, never on the fix's own dtf: on_line has already rounded that
    to whole metres, so half a metre of drift would pass a test whose name promises the same float. On the whole 2022 fleet,
    24,151 raw floats, not one differs (19 Sep 2026, rehearsal import)."""
    n = 0
    for tid, b in prepared("ggr2022").items():
        i0 = j0 = 0
        for f in b["plain"]["fixes"]:
            a, i0 = LINE.togo(f["lat"], f["lon"], i0, ahead=200)
            p, j0 = PLAIN.togo(f["lat"], f["lon"], j0, ahead=200)
            assert a == p and i0 == j0, (tid, f["at"], a, p)
            n += 1
    assert n > 7000

def test_the_live_fleet_is_held_out_of_the_wedge_by_bearing_alone():
    """The thing nothing else would notice. This year's figures are YB's OWN distance to finish and the site is checked against
    them to 0.07 nm, so smoothing one would be a disagreement with the answer key by construction — the reason the general form
    of this rule was refused. What holds the fleet out is NOR C.1.3, which requires Trindade to be left to port and so puts a boat
    sailing the course on the convex side. But the NOR forces the side AT THE ISLAND, not on the approach: measured 19 Sep 2026,
    a boat 24.6 nm east of the line abeam node 85, or 8.2 nm abeam node 87, is already inside the wedge, and the closest any fix
    of the master fixture comes is 5.35 deg of bearing — a margin it has only because the fleet is ten days out.

    So the margin is pinned here. While the past fleets were projected onto this line, the worker also counted it on every derive
    and warned the moment it was not nought; nothing is projected now, so this test is the only place it is measured. If it fails
    because the margin has shrunk, that is the fleet standing east of the line, and the answer to it is a decision about the
    measure, not a wider tolerance."""
    worst = 360.0
    for t in json.load(gzip.open(FIX / "AllPositions3.master.20260916T0230.json.gz")):
        if t["id"] in editions_data.EDITIONS["ggr2026"]["skip"]: continue
        for m in t["moments"]:
            x = (course.bearing_deg(APEX[0], APEX[1], m["lat"], m["lon"]) - PSI0) % 360.0
            worst = min(worst, (x - TRINDADE["span"]) % 360.0, (0.0 - x) % 360.0)
    assert 5.0 < worst < 5.5, worst                                              # measured 5.35 deg; the wedge is 80 deg wide

def test_the_two_named_2018_jumps_are_gone():
    """Jean-Luc Van Den Heede's distance to finish fell 1,173.2 nm in the four hours to 2018-08-04 04:00 while sailing 23.0,
    and Are Wiig's fell 984.7 nm to 2018-08-07 20:00 against 23.3 sailed. Both were one leap across the corner's bisector."""
    big = []
    for tid, b in prepared("ggr2018").items():
        for measure in ("plain", "rounded"):
            for p, q in zip(b[measure]["fixes"], b[measure]["fixes"][1:]):
                fell = (p["dtf"] - q["dtf"]) / 1852.0
                if fell - gc_nm(p["lat"], p["lon"], q["lat"], q["lon"]) > 100.0:
                    big.append((measure, tid, round(fell)))
    assert sorted(big) == [("plain", 7, 985), ("plain", 8, 1173)], big     # nothing under "rounded": both leaps are gone

def test_no_jump_is_left_in_the_trindade_box():
    """Inside the box the corner sits in (0 to 36 S, 40 W to 5 E) the 2018 fleet's largest one-leg anomaly falls from over a
    thousand miles to the fleets' own background at other bends. On the sample: 1,150.2 nm (Van Den Heede's leap) becomes 49.6,
    and that 49.6 is Are Wiig across a 26.3-hour silence in which she sailed 118.8 nm — over a leg of the grid's own four hours
    the worst is 37.9. For the WHOLE 2018 fleet, measured 19 Sep 2026 on the rehearsal import, the figure is 56.7 nm (Mark
    Sinclair, 27 Aug 2018, a bend on the way to the Cape, which reads 56.7 nm under today's measure too) — and it is 56.7 whether
    long gaps are counted or not, because correcting the far edge's symmetry took Are Wiig's long-gap leg down from 70.4 to 49.6.
    The tolerance is a tenth of a mile because these are pinned measurements, not a shape check."""
    box = lambda f: -36.0 <= f["lat"] <= 0.0 and -40.0 <= f["lon"] <= 5.0
    worst = {(m, long): max((p["dtf"] - q["dtf"]) / 1852.0 - gc_nm(p["lat"], p["lon"], q["lat"], q["lon"])
                            for tid, b in prepared("ggr2018").items() for p, q in zip(b[m]["fixes"], b[m]["fixes"][1:])
                            if box(p) and box(q) and (long or q["at"] - p["at"] <= 4.7 * 3600))
             for m in ("plain", "rounded") for long in (True, False)}
    assert abs(worst[("plain", True)] - 1150.2) < 0.1 and abs(worst[("plain", False)] - 1150.2) < 0.1
    assert abs(worst[("rounded", True)] - 49.6) < 0.1 and abs(worst[("rounded", False)] - 37.9) < 0.1, worst

def test_only_the_outbound_atlantic_passage_is_adjusted():
    """Which fixes move, and where. Every adjusted fix sits on the outbound passage, between leg index 53 and leg index 108 —
    measured on the sample here, and 53 to 108 on the WHOLE 2018 fleet too (19 Sep 2026, 773 fixes of 18,753). The homebound
    fixes that fall inside the wedge in bearing alone sit at legs 431 to 442 for the whole 2018 fleet and 428 to 442 for the
    whole 2022 fleet, over 340 legs clear of the gate of 88 +/- 200; no boat of the samples takes that particular track home, so
    the gate itself is held by test_far_from_the_corner_in_leg_index_is_bit_identical."""
    legs = set()
    for tid, b in prepared("ggr2018").items():
        i0 = j0 = 0
        for f in b["plain"]["fixes"]:
            a, i0 = LINE.togo(f["lat"], f["lon"], i0, ahead=200)
            p, j0 = PLAIN.togo(f["lat"], f["lon"], j0, ahead=200)
            if a != p:
                legs.add(i0)
    assert legs and min(legs) >= 53 and max(legs) <= 108, sorted(legs)

def test_finishers_still_reach_nought():
    """Every finisher of the two samples ends where she ends today, to the last decimal: the rule gives back at the wedge's far
    edge every mile it lent at the near one. Van Den Heede 0.35 and Mark Slats 1.44 nm to go on their documented finish dates;
    for the whole 2018 fleet, measured 19 Sep 2026 on the rehearsal import, Uku Randmaa 0.17, Tapio Lehtinen 1.63, Istvan Kopar
    0.00 — all five finishers unchanged. Simon Curwen's 3.02 nm is 2022's own and unchanged; it is YB's last fix of him standing
    three miles short, not the rule."""
    out = {}
    for race in ("ggr2018", "ggr2022"):
        for r in editions_data.TEAMS[race]:
            b = prepared(race).get(r["id"])
            if b and r["ended_how"] == "finished":
                out[(race, r["id"])] = tuple(round(b[m]["fixes"][-1]["dtf"] / 1852.0, 2) for m in ("rounded", "plain"))
    assert out == {("ggr2018", 8): (0.35, 0.35), ("ggr2018", 68): (1.44, 1.44),
                   ("ggr2022", 7): (0.13, 0.13), ("ggr2022", 11): (3.02, 3.02)}, out
    assert all(a < 3.0 for (race, _), (a, _) in out.items() if race == "ggr2018")
