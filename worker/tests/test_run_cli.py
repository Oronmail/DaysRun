# worker/tests/test_run_cli.py — the CLI's own wiring: which command each line calls with which arguments, and the promise that
# the Past races rows can never stop the live pipeline. No database and no network: every command is replaced by a recorder.
import pytest
from ggrstats import db, run

class FakeConn:
    """main() only opens the connection, reads one number from it and closes it; the commands themselves are replaced."""
    def __init__(self, value=None):
        self.value, self.closed, self.rolled_back = value, False, False
    def execute(self, q, args=None):
        value = self.value
        class R:
            def fetchone(self):
                return (value,)
        return R()
    def rollback(self):
        self.rolled_back = True
    def close(self):
        self.closed = True

T26 = 1789516800                                                      # 2026-09-16 00:00:00 UTC, a slot boundary

@pytest.fixture
def cli(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)                   # no check-in, no issue: monitoring stays silent
    monkeypatch.setattr(run.time, "time", lambda: T26 + 100.0)        # the clock stands still: the latest slot is the same one all through
    calls, conn = [], FakeConn()
    monkeypatch.setattr(db, "connect", lambda url=None: conn)
    monkeypatch.setattr(db, "load_fixes", lambda c, race: {})
    for name in ("cmd_capture", "cmd_derive", "cmd_weather", "cmd_weather_sweep", "cmd_revalidate", "cmd_editions",
                 "cmd_editions_check", "cmd_import_edition", "cmd_import_edition_wind", "safe_weather"):
        monkeypatch.setattr(run, name, (lambda n: lambda *a, **kw: calls.append((n, a, kw)) or 0)(name))
    return calls, conn

def only(calls, name):
    return [c for c in calls if c[0] == name]

def test_import_edition_takes_a_race_and_a_folder(cli):
    calls, conn = cli
    run.main(["import-edition", "--race", "ggr2022", "--from-dir", "/tmp/ggr2022"])
    assert only(calls, "cmd_import_edition") == [("cmd_import_edition", (conn, "ggr2022"), {"from_dir": "/tmp/ggr2022"})]
    assert conn.closed

def test_import_edition_wind_takes_the_pace_and_the_last_day(cli):
    calls, conn = cli
    run.main(["import-edition-wind", "--race", "ggr2018", "--until-day", "45", "--pace", "0.5"])
    assert only(calls, "cmd_import_edition_wind") == [("cmd_import_edition_wind", (conn, "ggr2018"), {"pace_s": 0.5, "until_day": 45})]

def test_editions_defaults_to_the_latest_slot_and_takes_as_of_and_since(cli):
    calls, conn = cli
    run.main(["editions", "--race", "ggr2022"])
    assert calls[0][:2] == ("cmd_editions", (conn, "ggr2022", T26, None))
    calls.clear()
    run.main(["editions", "--as-of", "2026-09-16T00:00:00Z", "--since", "2026-09-11T00:00:00Z"])
    assert calls[0][1][2:] == (1789516800, 1789084800)

def test_editions_check_runs_the_cross_check_instead(cli):
    calls, conn = cli
    assert run.main(["editions", "--check"]) == 0
    assert [c[0] for c in calls] == ["cmd_editions_check"]

def test_all_reaches_revalidate_even_when_the_editions_rows_fail(cli, monkeypatch):
    """The integration promise: the Past races tables are written after the live pipeline's own work and inside their own try,
    so a fault there can never stop the capture, the derive or the site's revalidation."""
    calls, conn = cli
    def boom(*a, **kw):
        calls.append(("cmd_editions", a, kw))
        raise RuntimeError("the editions rows failed on purpose")
    monkeypatch.setattr(run, "cmd_editions", boom)
    run.main(["all"])
    assert [c[0] for c in calls] == ["cmd_capture", "cmd_derive", "safe_weather", "cmd_weather_sweep", "cmd_editions", "cmd_revalidate"]
    assert conn.rolled_back and conn.closed

def test_all_writes_the_editions_rows_after_the_derive_and_before_revalidate(cli):
    calls, conn = cli
    run.main(["all"])
    assert [c[0] for c in calls] == ["cmd_capture", "cmd_derive", "safe_weather", "cmd_weather_sweep", "cmd_editions", "cmd_revalidate"]
    assert not conn.rolled_back
    name, args, kw = only(calls, "cmd_editions")[0]
    assert args[:3] == (conn, "ggr2026", T26) and kw == {"fixes": {}}                          # the fixes the derive loop already read
