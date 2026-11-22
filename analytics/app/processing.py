"""Streaming processing: constant memory over NDJSON task-activity exports."""
import json
from collections import Counter
from datetime import date, datetime
from typing import Iterable

def _d(v):
    return datetime.fromisoformat(v.replace("Z", "+00:00")).date() if isinstance(v, str) and v else None

def summarize(rows: Iterable[dict], today: date | None = None) -> dict:
    today = today or date.today()
    by_status, per_assignee, overdue, cycle_days, total, bad = Counter(), Counter(), 0, 0.0, 0, 0
    done_n = 0
    for t in rows:
        try:
            st = t["status"]
            total += 1
            by_status[st] += 1
            due = _d(t.get("due_date"))
            if st != "done" and due and due < today:
                overdue += 1
            if st == "done":
                per_assignee[str(t.get("assignee_id"))] += 1
                c, u = _d(t.get("created_at")), _d(t.get("updated_at"))
                if c and u:
                    cycle_days += (u - c).days
                    done_n += 1
        except (KeyError, ValueError, TypeError):
            bad += 1
    health = "green" if total == 0 or overdue / total < 0.1 else "amber" if overdue / total < 0.25 else "red"
    return {"total": total, "by_status": dict(by_status), "overdue": overdue, "completed_by_assignee": dict(per_assignee),
            "avg_cycle_days": round(cycle_days / done_n, 2) if done_n else None, "invalid_rows": bad, "health": health}

def iter_ndjson(lines: Iterable[bytes | str]):
    for ln in lines:
        ln = ln.strip()
        if ln:
            try:
                yield json.loads(ln)
            except json.JSONDecodeError:
                yield {}
