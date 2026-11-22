import os
os.environ["SERVICE_KEY"] = "k"
from datetime import date
from fastapi.testclient import TestClient
from app.main import app
from app.processing import summarize
c = TestClient(app); H = {"x-service-key": "k"}

def test_health(): assert c.get("/healthz").status_code == 200
def test_requires_key(): assert c.post("/v1/project-health", json={"tasks": []}).status_code == 401
def test_validation(): assert c.post("/v1/project-health", json={"tasks": [{"x": 1}]}, headers=H).status_code == 422
def test_overdue_and_cycle():
    rows = [{"status": "todo", "due_date": "2020-01-01"}, {"status": "done", "assignee_id": "a", "created_at": "2024-01-01T00:00:00Z", "updated_at": "2024-01-05T00:00:00Z"}]
    r = summarize(rows, today=date(2025, 1, 1))
    assert r["overdue"] == 1 and r["avg_cycle_days"] == 4 and r["completed_by_assignee"] == {"a": 1}
def test_bad_rows_counted(): assert summarize([{"nope": 1}])["invalid_rows"] == 1
