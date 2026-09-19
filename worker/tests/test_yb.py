# worker/tests/test_yb.py
import gzip, pathlib
import pytest
from ggrstats import yb

class FakeResp:
    def __init__(self, status, content=b""):
        self.status_code, self.content = status, content
    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

class FakeSession:
    """Answers cf.yb.tl with a failure and yb.tl with the payload, to prove the host fallback."""
    def __init__(self):
        self.calls = []
    def get(self, url, timeout=None, headers=None):
        self.calls.append(url)
        if url.startswith("https://cf.yb.tl/"):
            return FakeResp(503)
        return FakeResp(200, b'{"tags": []}' if url.endswith("leaderboard") else b"\x02\x00\x00\x00\x00")

def test_fetch_falls_back_to_second_host():
    s = FakeSession()
    data = yb.fetch("ggr2026", "leaderboard", session=s)
    assert data == b'{"tags": []}'
    assert s.calls[0] == "https://cf.yb.tl/JSON/ggr2026/leaderboard"
    assert s.calls[1] == "https://yb.tl/JSON/ggr2026/leaderboard"

def test_snapshot_writes_gzipped_files(tmp_path):
    s = FakeSession()
    out = yb.snapshot("ggr2026", tmp_path, session=s, now=1789516800)   # 2026-09-16 00:00:00 UTC
    assert set(out) == {"RaceSetup", "leaderboard", "zegments", "AllPositions3"}
    path = out["AllPositions3"][1]
    assert path.name == "AllPositions3.20260916T0000.gz"
    assert gzip.open(path).read() == b"\x02\x00\x00\x00\x00"

def test_snapshot_can_be_asked_for_a_few_endpoints_only(tmp_path):
    """The import of a past race needs RaceSetup, zegments and the track, never the leaderboard — which YB served as a 503 for
    2018 on the morning of 18 Sep 2026, and would have taken the whole import down with it."""
    s = FakeSession()
    out = yb.snapshot("ggr2018", tmp_path, session=s, now=1530439200, names=("RaceSetup", "zegments", "AllPositions3"))
    assert set(out) == {"RaceSetup", "zegments", "AllPositions3"}
    assert not any(url.endswith("leaderboard") for url in s.calls)

def test_fetch_raises_after_both_hosts_fail():
    class Dead(FakeSession):
        def get(self, url, timeout=None, headers=None):
            return FakeResp(500)
    with pytest.raises(yb.FetchError):
        yb.fetch("ggr2026", "RaceSetup", session=Dead(), attempts=1)
