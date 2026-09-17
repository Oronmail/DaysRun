# worker/ggrstats/decode.py
"""Decode YB's AllPositions3 binary into per-team fixes. Port of the viewer's PositionParser."""
import struct

def decode(buf):
    flags = buf[0]
    has_alt, has_dtf, has_lap, has_pc = bool(flags & 1), bool(flags & 2), bool(flags & 4), bool(flags & 8)
    base = struct.unpack_from(">I", buf, 1)[0]
    pos, n, teams = 5, len(buf), []
    while pos < n:
        team_id, count = struct.unpack_from(">HH", buf, pos)
        pos += 4
        prev, moments = None, []
        for _ in range(count):
            m = {}
            if buf[pos] & 0x80:                                   # delta record
                w, dlat, dlon = struct.unpack_from(">Hhh", buf, pos)
                pos += 6
                if has_alt:
                    m["alt"] = struct.unpack_from(">h", buf, pos)[0]; pos += 2
                if has_dtf:
                    m["dtf"] = prev["dtf"] + struct.unpack_from(">h", buf, pos)[0]; pos += 2
                    if has_lap:
                        m["lap"] = buf[pos]; pos += 1
                if has_pc:
                    m["pc"] = prev.get("pc", 0.0) + struct.unpack_from(">h", buf, pos)[0] / 32000.0; pos += 2
                m["lat"] = prev["lat"] + dlat
                m["lon"] = prev["lon"] + dlon
                m["at"] = prev["at"] - (w & 0x7FFF)
            else:                                                  # absolute record
                t, lat, lon = struct.unpack_from(">Iii", buf, pos)
                pos += 12
                if has_alt:
                    m["alt"] = struct.unpack_from(">h", buf, pos)[0]; pos += 2
                if has_dtf:
                    m["dtf"] = struct.unpack_from(">i", buf, pos)[0]; pos += 4
                    if has_lap:
                        m["lap"] = buf[pos]; pos += 1
                if has_pc:
                    m["pc"] = struct.unpack_from(">i", buf, pos)[0] / 21e6; pos += 4
                m["lat"], m["lon"], m["at"] = lat, lon, base + t
            moments.append(m)
            prev = m
        for m in moments:
            m["lat"] /= 1e5
            m["lon"] /= 1e5
        teams.append({"id": team_id, "moments": moments})
    return teams
