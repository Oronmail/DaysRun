# worker/ggrstats/monitoring.py
"""Tells Sentry what the worker is doing, when SENTRY_DSN is set; silent otherwise (tests, a laptop). Three things: an unhandled
error in a run becomes an issue with its trace; the `all` run checks in on a cron monitor, so a run that never starts or keeps
failing is noticed; and the two failures the worker swallows on purpose (weather, backup) are counted as warnings. Nothing here
may ever stop or fail a run."""
import contextlib, logging, os

log = logging.getLogger("ggrstats")
_on = False
# The worker is started at :20 every hour (and at :05 and :10 after each 4-hourly report). Missed = nothing by :50; an issue after
# two failures in a row, closed by one good run. Sentry creates the monitor from this on the first check-in.
ALL_MONITOR = {"schedule": {"type": "crontab", "value": "20 * * * *"}, "timezone": "UTC", "checkin_margin": 30, "max_runtime": 20,
               "failure_issue_threshold": 2, "recovery_threshold": 1}

def init():
    global _on
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        _on = False
        return False
    try:
        import sentry_sdk
        sentry_sdk.init(dsn=dsn, environment=os.getenv("SENTRY_ENVIRONMENT", "production"), traces_sample_rate=0.0, send_default_pii=False)
        _on = True
    except Exception as e:                        # monitoring must never be the reason a run fails
        log.warning("monitoring could not start: %s", e)
        _on = False
    return _on

def warn(message, **tags):
    if not _on:
        return
    try:
        import sentry_sdk
        with sentry_sdk.new_scope() as scope:
            for k, v in tags.items():
                scope.set_tag(k, v)
            sentry_sdk.capture_message(message, level="warning")
    except Exception as e:
        log.warning("monitoring could not send a warning: %s", e)

@contextlib.contextmanager
def checkin(slug, config=None):
    """The job runs inside; its own error always comes out again, checked in as a failure."""
    if not _on:
        yield
        return
    from sentry_sdk.crons import monitor
    with monitor(monitor_slug=slug, monitor_config=config or ALL_MONITOR):
        yield
