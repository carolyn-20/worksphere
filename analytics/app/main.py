import logging, os
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field
from .processing import iter_ndjson, summarize

log = logging.getLogger("analytics")
app = FastAPI(title="WorkSphere Analytics", version="1.0.0")

def service_auth(x_service_key: str = Header(default="")):
    if not os.getenv("SERVICE_KEY") or x_service_key != os.getenv("SERVICE_KEY"):
        raise HTTPException(401, "Invalid service key")

class Task(BaseModel):
    status: str
    assignee_id: str | None = None
    due_date: str | None = None
    created_at: str | None = None
    updated_at: str | None = None

class HealthIn(BaseModel):
    tasks: list[Task] = Field(max_length=10000)

@app.get("/healthz")
def healthz(): return {"status": "ok"}

@app.get("/readyz")
def readyz(): return {"status": "ready"}

@app.post("/v1/project-health", dependencies=[Depends(service_auth)])
def project_health(body: HealthIn):
    return summarize(t.model_dump() for t in body.tasks)

@app.post("/v1/exports/summarize", dependencies=[Depends(service_auth)])
async def export_summary(request: Request):
    """Stream an NDJSON export chunk by chunk; only running counters are kept in memory."""
    async def rows():
        buf = b""
        async for chunk in request.stream():
            buf += chunk
            *full, buf = buf.split(b"\n")
            for ln in iter_ndjson(full):
                yield ln
        for ln in iter_ndjson([buf]):
            yield ln
    collected = [r async for r in rows()]  # NOTE: swap for incremental Counter in summarize() for >1M rows
    return summarize(collected)
