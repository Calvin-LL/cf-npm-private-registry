-- Migration number: 0003     2026-08-20T00:00:00.000Z
ALTER TABLE packages ADD COLUMN ecosystem TEXT NOT NULL DEFAULT 'npm'
  CHECK (ecosystem IN ('npm', 'cargo'));
ALTER TABLE packages ADD COLUMN normalized_name TEXT;

UPDATE packages SET normalized_name = name WHERE normalized_name IS NULL;

CREATE UNIQUE INDEX idx_packages_ecosystem_normalized_name
  ON packages(ecosystem, normalized_name);

CREATE TABLE cargo_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  version_key TEXT NOT NULL,
  index_entry TEXT NOT NULL,
  tarball_key TEXT NOT NULL,
  checksum TEXT NOT NULL,
  published_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(package_id, version_key)
);

CREATE INDEX idx_cargo_versions_package_id ON cargo_versions(package_id);
