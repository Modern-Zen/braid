-- Headwaters cross-River index. Live coordination (Lines, presence, feed, counters)
-- lives in each RiverAgent's SQLite; this is the durable, queryable record.

CREATE TABLE rivers (
  id            TEXT PRIMARY KEY,            -- slug, "riverlevels"
  name          TEXT NOT NULL,
  owner         TEXT NOT NULL,               -- "modern-zen"
  main_repo     TEXT NOT NULL UNIQUE,        -- "river-riverlevels"
  remote        TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  policy        TEXT NOT NULL,               -- JSON RiverPolicy
  next_channel  INTEGER NOT NULL DEFAULT 1,  -- River-wide ch-<n> counter
  next_logbook  INTEGER NOT NULL DEFAULT 1,  -- River-wide Logbook number
  created_at    INTEGER NOT NULL
);

CREATE TABLE intents (
  river_id   TEXT NOT NULL REFERENCES rivers(id),
  id         TEXT NOT NULL,                  -- slug, "rate-limit-api"
  title      TEXT NOT NULL,
  goal       TEXT NOT NULL,
  checks     TEXT NOT NULL DEFAULT '[]',     -- JSON string[]
  status     TEXT NOT NULL DEFAULT 'open',   -- open|running|scouting|confluence|merged|eddy
  mode       TEXT NOT NULL DEFAULT 'scripted',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (river_id, id)
);

CREATE TABLE channels (
  river_id      TEXT NOT NULL REFERENCES rivers(id),
  id            TEXT NOT NULL,               -- "ch-5"
  intent_id     TEXT NOT NULL,
  repo          TEXT NOT NULL UNIQUE,        -- "river-riverlevels--ch-5"
  remote        TEXT NOT NULL,
  agent         TEXT NOT NULL,               -- the agent that actually did the work
  model         TEXT,
  strategy      TEXT NOT NULL,
  replay        INTEGER NOT NULL DEFAULT 0,  -- 1 = scripted replay of a recorded series
  status        TEXT NOT NULL,
  status_text   TEXT,
  head_sha      TEXT,
  commits       INTEGER NOT NULL DEFAULT 0,
  preview_url   TEXT,
  screenshot_key TEXT,
  cost_usd      REAL,
  duration_ms   INTEGER,
  parent_channel TEXT,                       -- set for replays: forked from this Channel
  parent_sha    TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (river_id, id)
);
CREATE INDEX channels_by_intent ON channels(river_id, intent_id);

-- One review per (repo, sha). The primary key is the idempotency key.
CREATE TABLE reviews (
  repo         TEXT NOT NULL,
  sha          TEXT NOT NULL,
  river_id     TEXT NOT NULL,
  channel_id   TEXT NOT NULL,
  intent_id    TEXT NOT NULL,
  state        TEXT NOT NULL DEFAULT 'running', -- running|passed|failed
  tests_passed INTEGER,
  tests_total  INTEGER,
  failures     TEXT,                         -- JSON string[]
  added        INTEGER,
  removed      INTEGER,
  files        INTEGER,
  risk         REAL,
  risk_reasons TEXT,                         -- JSON string[]
  log_key      TEXT,                         -- R2 key of the test log
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  PRIMARY KEY (repo, sha)
);
CREATE INDEX reviews_by_channel ON reviews(river_id, channel_id, created_at DESC);

CREATE TABLE verdicts (
  river_id    TEXT NOT NULL,
  intent_id   TEXT NOT NULL,
  kind        TEXT NOT NULL,                 -- winner|tie
  ranked      TEXT NOT NULL,                 -- JSON RankedChannel[]
  rationale   TEXT NOT NULL,
  judge_model TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (river_id, intent_id)
);

CREATE TABLE eddy_cards (
  id          TEXT PRIMARY KEY,
  river_id    TEXT NOT NULL,
  intent_id   TEXT NOT NULL,
  kind        TEXT NOT NULL,                 -- pick|approve|confirm
  question    TEXT NOT NULL,
  meta        TEXT NOT NULL,
  context     TEXT NOT NULL,
  actions     TEXT NOT NULL,                 -- JSON
  workflow_id TEXT,
  decision    TEXT,
  decided_by  TEXT,
  decided_at  INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX eddy_open ON eddy_cards(river_id, decided_at);

CREATE TABLE logbook_index (
  river_id   TEXT NOT NULL,
  number     TEXT NOT NULL,                  -- "0012"
  channel_id TEXT NOT NULL,
  intent_id  TEXT NOT NULL,
  repo       TEXT NOT NULL,
  path       TEXT NOT NULL,                  -- .headwaters/logbook/0012-ch-5.md
  sha        TEXT,
  agent      TEXT,
  model      TEXT,
  cost_usd   REAL,
  plan       TEXT,
  decisions  TEXT,                           -- JSON string[]
  created_at INTEGER NOT NULL,
  PRIMARY KEY (river_id, number)
);

-- Every Artifacts event we processed, keyed for idempotency; raw bodies live in R2.
CREATE TABLE events_index (
  key        TEXT PRIMARY KEY,               -- e.g. pushed:<repo>:<sha>
  type       TEXT NOT NULL,
  repo       TEXT NOT NULL,
  raw_key    TEXT NOT NULL,                  -- R2 key
  received_at INTEGER NOT NULL
);
CREATE INDEX events_by_repo ON events_index(repo, received_at DESC);
