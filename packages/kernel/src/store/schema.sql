-- Pane kernel schema. Applied on open; user_version tracks it.
-- Timestamps are Unix milliseconds. Booleans are 0/1. JSON columns hold JSON text.

CREATE TABLE IF NOT EXISTS actors (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('human', 'agent', 'system')),
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  goals       TEXT NOT NULL DEFAULT '',
  created_by  TEXT NOT NULL REFERENCES actors(id),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  archived_at INTEGER
);

CREATE TABLE IF NOT EXISTS repositories (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id),
  name           TEXT NOT NULL,
  mode           TEXT NOT NULL CHECK (mode IN ('managed', 'adopted')),
  git_dir        TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  remote_url     TEXT,
  created_by     TEXT NOT NULL REFERENCES actors(id),
  created_at     INTEGER NOT NULL,
  UNIQUE (project_id, name)
);

CREATE TABLE IF NOT EXISTS worktrees (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL REFERENCES projects(id),
  repository_id      TEXT NOT NULL REFERENCES repositories(id),
  parent_worktree_id TEXT REFERENCES worktrees(id),
  is_main            INTEGER NOT NULL DEFAULT 0,
  name               TEXT NOT NULL,
  branch             TEXT NOT NULL,
  path               TEXT NOT NULL UNIQUE,
  objective          TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL CHECK (status IN ('working', 'idle', 'merge_ready', 'merged', 'abandoned')),
  created_by         TEXT NOT NULL REFERENCES actors(id),
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  UNIQUE (repository_id, name)
);
CREATE UNIQUE INDEX IF NOT EXISTS worktrees_one_main ON worktrees(repository_id) WHERE is_main = 1;

CREATE TABLE IF NOT EXISTS agents (
  id             TEXT PRIMARY KEY REFERENCES actors(id),
  project_id     TEXT NOT NULL REFERENCES projects(id),
  provider       TEXT NOT NULL,
  model          TEXT,
  session_key    TEXT,
  lifecycle      TEXT NOT NULL CHECK (lifecycle IN ('online', 'offline', 'suspended', 'archived')),
  forked_from_id TEXT REFERENCES agents(id),
  created_by     TEXT NOT NULL REFERENCES actors(id),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agents_project ON agents(project_id);

CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id),
  scope_id        TEXT NOT NULL,
  origin_scope_id TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'blocked', 'done', 'cancelled')),
  created_by      TEXT NOT NULL REFERENCES actors(id),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project_id);

CREATE TABLE IF NOT EXISTS problems (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id),
  scope_id        TEXT NOT NULL,
  origin_scope_id TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution      TEXT,
  created_by      TEXT NOT NULL REFERENCES actors(id),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS problems_project ON problems(project_id);

CREATE TABLE IF NOT EXISTS questions (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id),
  scope_id        TEXT NOT NULL,
  origin_scope_id TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL CHECK (status IN ('open', 'answered')),
  answer          TEXT,
  created_by      TEXT NOT NULL REFERENCES actors(id),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS questions_project ON questions(project_id);

CREATE TABLE IF NOT EXISTS decisions (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id),
  scope_id        TEXT NOT NULL,
  origin_scope_id TEXT NOT NULL,
  title           TEXT NOT NULL,
  rationale       TEXT NOT NULL DEFAULT '',
  alternatives    TEXT NOT NULL DEFAULT '[]',
  created_by      TEXT NOT NULL REFERENCES actors(id),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS decisions_project ON decisions(project_id);

CREATE TABLE IF NOT EXISTS attention_requests (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id),
  scope_id        TEXT NOT NULL,
  origin_scope_id TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('decision', 'approval', 'review', 'input', 'manual_action', 'unblock')),
  title           TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  blocking        INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution      TEXT,
  resolved_at     INTEGER,
  created_by      TEXT NOT NULL REFERENCES actors(id),
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS attention_project ON attention_requests(project_id, status);

CREATE TABLE IF NOT EXISTS commits (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  repository_id TEXT NOT NULL REFERENCES repositories(id),
  sha           TEXT NOT NULL,
  message       TEXT NOT NULL,
  author_name   TEXT NOT NULL,
  authored_at   INTEGER NOT NULL,
  insertions    INTEGER NOT NULL DEFAULT 0,
  deletions     INTEGER NOT NULL DEFAULT 0,
  files_changed INTEGER NOT NULL DEFAULT 0,
  explanation   TEXT,
  recorded_by   TEXT NOT NULL REFERENCES actors(id),
  recorded_at   INTEGER NOT NULL,
  UNIQUE (repository_id, sha)
);

CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind       TEXT NOT NULL CHECK (kind IN ('dm', 'group', 'ask')),
  key        TEXT NOT NULL UNIQUE,
  scope_id   TEXT,
  title      TEXT,
  created_by TEXT NOT NULL REFERENCES actors(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS conversations_project ON conversations(project_id);

CREATE TABLE IF NOT EXISTS participants (
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  actor_id        TEXT NOT NULL REFERENCES actors(id),
  joined_at       INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, actor_id)
);

CREATE TABLE IF NOT EXISTS messages (
  seq             INTEGER PRIMARY KEY AUTOINCREMENT,
  id              TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id),
  from_actor_id   TEXT NOT NULL REFERENCES actors(id),
  body            TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversation_id, seq);

CREATE TABLE IF NOT EXISTS deliveries (
  message_id  TEXT NOT NULL REFERENCES messages(id),
  to_actor_id TEXT NOT NULL REFERENCES actors(id),
  status      TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'read', 'failed')),
  detail      TEXT,
  updated_at  INTEGER NOT NULL,
  read_at     INTEGER,
  PRIMARY KEY (message_id, to_actor_id)
);
CREATE INDEX IF NOT EXISTS deliveries_inbox ON deliveries(to_actor_id, status);

CREATE TABLE IF NOT EXISTS relations (
  source_id  TEXT NOT NULL,
  type       TEXT NOT NULL,
  target_id  TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES actors(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (source_id, type, target_id)
);
CREATE INDEX IF NOT EXISTS relations_target ON relations(target_id, type);

CREATE TABLE IF NOT EXISTS events (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  id         TEXT NOT NULL UNIQUE,
  project_id TEXT,
  kind       TEXT NOT NULL,
  actor_id   TEXT NOT NULL REFERENCES actors(id),
  at         INTEGER NOT NULL,
  target_id  TEXT,
  cause_id   TEXT,
  payload    TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS events_project ON events(project_id, seq);
CREATE INDEX IF NOT EXISTS events_target ON events(target_id, seq);
