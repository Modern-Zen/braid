-- MCP: per-River agent bearer tokens (hashed) and Channels driven by external agents.

CREATE TABLE river_tokens (
  token_hash TEXT PRIMARY KEY,               -- SHA-256 hex of the bearer token
  river_id   TEXT NOT NULL,
  label      TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

-- 'headwaters' = run by a ChannelAgent (scripted or live); 'mcp' = an external agent drives it.
ALTER TABLE channels ADD COLUMN source TEXT NOT NULL DEFAULT 'headwaters';
