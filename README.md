# WorkSphere

Multi-tenant project management. Stack follows the brief: Next.js App Router + TypeScript + Tailwind + TanStack Query + zod, Express, FastAPI, PostgreSQL.

## Architecture
Next.js UI → Express API (system of record owner: users, projects, tasks, history, notifications, audit) → PostgreSQL. Express → FastAPI (owns **no** data; stateless analytics) via `X-Service-Key`. Worker (`api/src/worker.js`) drains the notification outbox.

## Run
```
cp .env.example .env   # fill in secrets
docker compose up --build
# UI http://localhost:3001   API http://localhost:3000/api/v1   (migrations auto-run from db/migrations)
```

Run each test suite from its service folder:

API (Node.js):
```
cd api
npm install
npm test
```

Frontend (Node.js):
```
cd frontend
npm install
npm test
```

Analytics (Python):
```
cd analytics
python -m pip install -r requirements.txt
python -m pytest -q
```

## Capstone (concurrent edits)
`PATCH /tasks/:id` requires `version`; `UPDATE ... WHERE version=$n` → stale returns **409** with the current row (no silent overwrite). Every change writes `activity_events` (UNIQUE(task_id,version)) in the same transaction. Notifications use `dedupe_key` + `ON CONFLICT DO NOTHING`, so retries never double-notify.

## Assessment status (honest)
| # | Area | Status |
|---|------|--------|
| 01 | Frontend | Partial: App Router, TS, Tailwind, TanStack Query, zod forms, role-based nav + protected shell, 409 handling, a11y labels. One shared layout (not separate per-role layouts); all pages are client components; no RTL/Playwright; tokens in sessionStorage (trade-off noted in lib/api.ts) |
| 02 | Express API | Done core: orgs, invites, teams(create), projects, milestones, tasks, comments, activity |
| 03 | PostgreSQL | Done schema/constraints/indexes; single migration file, no migration runner; attachments table unused |
| 04 | Auth | Done: JWT 15m, refresh rotation + reuse detection, logout, RBAC, tenant filters |
| 05 | Python processing | Partial: streaming `processing.py`; no CSV/JSON report writer or benchmark |
| 06 | FastAPI | Done: health/ready, service key, Pydantic, project-health analytics (workload/cycle-time partial) |
| 07 | Jobs/real-time | Partial: outbox worker w/ SKIP LOCKED, retries, dead-letter. No Redis/BullMQ, no websockets (UI relies on refetch) |
| 08 | Integrations | NOT done: email is mocked; no storage/webhook/payments |
| 09 | Docker | Done basics (non-root, healthchecks, internal network); no staging/prod overrides |
| 10 | Git | You must do: branches, PRs, CODEOWNERS, protection |
| 11 | CI/CD | Partial: lint-less CI (test, audit, build). No registry/deploy/rollback |
| 12 | Testing | Partial: API + pytest unit tests. Missing DB integration, tenant-isolation, concurrency, Playwright |
| 13 | OpenAPI | FastAPI auto docs at /docs; Express spec + Postman NOT done |
| 14 | Prod deploy | NOT done |
| 15 | Incident drills/diagrams | NOT done |

Not built: workflow rules module, attachments endpoints, subtask UI, task-detail editing beyond status.
