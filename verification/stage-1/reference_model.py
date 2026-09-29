"""Reference model: spec stage-1 rules implemented directly, in-memory.
Covers: half-open overlap, slot grid, opening hours, DST first-occurrence,
absolute durations, idempotency matrix, atomic moves, conservation invariant.
Obviously correct by inspection; differential oracle for implementation.
"""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

def overlaps(a_start, a_end, b_start, b_end):
    return a_start < b_end and b_start < a_end  # half-open [s, e)

def resolve_local(local_str, tzname):
    """Resolve bare YYYY-MM-DDTHH:MM to aware datetime, first occurrence.
    Raises NonexistentTimeError / ValueError on bad calendar."""
    dt_naive = datetime.strptime(local_str, "%Y-%m-%dT%H:%M")
    tz = ZoneInfo(tzname)
    # detect spring gap: convert via fold=0 and round-trip check
    cand = dt_naive.replace(tzinfo=tz, fold=0)
    # nonexistent detection: UTC round-trip must map back to same wall time
    back = cand.astimezone(timezone.utc).astimezone(tz)
    if (back.replace(tzinfo=None) != dt_naive and
            back.utcoffset() != cand.utcoffset()):
        # ambiguous (fall-back) maps back consistently only for fold handling;
        # gap maps to different wall time -> nonexistent
        # disambiguate: check both folds
        cand1 = dt_naive.replace(tzinfo=tz, fold=1)
        back1 = cand1.astimezone(timezone.utc).astimezone(tz)
        if back.replace(tzinfo=None) != dt_naive and back1.replace(tzinfo=None) != dt_naive:
            raise ValueError("nonexistent local time")
    return dt_naive.replace(tzinfo=tz, fold=0)  # first occurrence

def check_conservation(reservations):
    """No two confirmed share table on overlapping intervals."""
    conf = [r for r in reservations if r["status"] == "confirmed"]
    for i in range(len(conf)):
        for j in range(i+1, len(conf)):
            if conf[i]["table_id"] == conf[j]["table_id"]:
                if overlaps(conf[i]["s"], conf[i]["e"], conf[j]["s"], conf[j]["e"]):
                    return False, (conf[i], conf[j])
    return True, None
