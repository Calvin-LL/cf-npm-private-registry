-- Migration number: 0001 	 2026-07-11T00:00:00.000Z
CREATE TABLE packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  can_read INTEGER NOT NULL DEFAULT 0,
  can_write INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT
);
CREATE INDEX idx_tokens_package_id ON tokens(package_id);

CREATE TABLE versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  manifest TEXT NOT NULL,
  tarball_key TEXT NOT NULL,
  shasum TEXT NOT NULL,
  integrity TEXT NOT NULL,
  published_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(package_id, version)
);
CREATE INDEX idx_versions_package_id ON versions(package_id);

CREATE TABLE dist_tags (
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  version TEXT NOT NULL,
  PRIMARY KEY (package_id, tag)
);
