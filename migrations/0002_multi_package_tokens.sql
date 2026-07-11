-- Migration number: 0002 	 2026-07-11T09:00:00.000Z
-- Tokens may now grant access to multiple packages through a junction table.
-- The old tokens table is renamed first: dropping it while token_packages
-- rows reference it would fire the ON DELETE CASCADE and empty the junction.
ALTER TABLE tokens RENAME TO tokens_old;

CREATE TABLE tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  can_read INTEGER NOT NULL DEFAULT 0,
  can_write INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_used_at TEXT
);

INSERT INTO tokens (id, label, token_hash, token_prefix, can_read, can_write, created_at, last_used_at)
SELECT id, label, token_hash, token_prefix, can_read, can_write, created_at, last_used_at FROM tokens_old;

CREATE TABLE token_packages (
  token_id INTEGER NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  PRIMARY KEY (token_id, package_id)
);
CREATE INDEX idx_token_packages_package_id ON token_packages(package_id);

INSERT INTO token_packages (token_id, package_id)
SELECT id, package_id FROM tokens_old;

DROP TABLE tokens_old;
