CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE organizations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id),
  email text NOT NULL UNIQUE, name text NOT NULL, password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('platform_admin','owner','project_manager','member','auditor')),
  created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE teams(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL, UNIQUE(org_id,name));
CREATE TABLE team_members(team_id uuid REFERENCES teams(id) ON DELETE CASCADE, user_id uuid REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(team_id,user_id));
CREATE TABLE invitations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id), email text NOT NULL,
  role text NOT NULL CHECK (role IN ('project_manager','member','auditor')), token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL, accepted_at timestamptz);
CREATE TABLE refresh_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), family_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE, revoked boolean NOT NULL DEFAULT false, expires_at timestamptz NOT NULL);
CREATE TABLE projects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')), created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON projects(org_id);
CREATE TABLE milestones(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name text NOT NULL, due_date date);
CREATE TABLE tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE, parent_id uuid REFERENCES tasks(id) ON DELETE CASCADE,
  milestone_id uuid REFERENCES milestones(id), title text NOT NULL, description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  assignee_id uuid REFERENCES users(id), due_date date, version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON tasks(org_id, project_id, status);
CREATE TABLE comments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, author_id uuid NOT NULL REFERENCES users(id), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE attachments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, object_key text NOT NULL, filename text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
-- append-only history: one row per task version
CREATE TABLE activity_events(id bigserial PRIMARY KEY, org_id uuid NOT NULL, task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL, version integer NOT NULL, action text NOT NULL, changes jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(task_id, version));
-- outbox: dedupe_key makes retries/duplicates harmless
CREATE TABLE notifications(id bigserial PRIMARY KEY, org_id uuid NOT NULL, user_id uuid NOT NULL, kind text NOT NULL, payload jsonb NOT NULL,
  dedupe_key text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','dead')),
  attempts integer NOT NULL DEFAULT 0, last_error text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE audit_logs(id bigserial PRIMARY KEY, org_id uuid NOT NULL, actor_id uuid, action text NOT NULL, entity text NOT NULL, entity_id text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE processed_webhooks(event_id text PRIMARY KEY, received_at timestamptz NOT NULL DEFAULT now());
