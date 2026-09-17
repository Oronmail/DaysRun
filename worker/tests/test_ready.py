# worker/tests/test_ready.py
from ggrstats import stats

def snap(fresh, stale=()):
    return {"boats": [{"id": i, "stale": False} for i in fresh] + [{"id": i, "stale": True} for i in stale]}

def test_a_report_is_published_at_once_when_the_whole_fleet_is_in():
    assert stats.ready_to_publish(snap([1, 2, 3]), previously_fresh={1, 2, 3}, age_s=5 * 60) is True

def test_it_waits_a_few_minutes_for_a_boat_that_reported_last_time():
    """The worker now starts five minutes after a report. A boat whose fix lands at seven minutes must not be shown, and written
    into the feed, as having missed the report."""
    assert stats.ready_to_publish(snap([1, 2], stale=[3]), previously_fresh={1, 2, 3}, age_s=5 * 60) is False
    assert stats.ready_to_publish(snap([1, 2], stale=[3]), previously_fresh={1, 2, 3}, age_s=11 * 60) is False

def test_but_not_for_ever():
    assert stats.ready_to_publish(snap([1, 2], stale=[3]), previously_fresh={1, 2, 3}, age_s=12 * 60) is True
    assert stats.ready_to_publish(snap([1, 2], stale=[3]), previously_fresh={1, 2, 3}, age_s=6 * 3600) is True     # a backfill, a catch-up

def test_a_boat_already_silent_last_time_is_not_waited_for():
    assert stats.ready_to_publish(snap([1, 2], stale=[3]), previously_fresh={1, 2}, age_s=5 * 60) is True
    assert stats.ready_to_publish(snap([1, 2, 3]), previously_fresh=set(), age_s=60) is True                         # the first report of all
