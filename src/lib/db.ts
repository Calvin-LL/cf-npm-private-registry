export interface PackageRow {
  id: number;
  name: string;
  created_at: string;
}

export interface PackageSummary extends PackageRow {
  version_count: number;
  token_count: number;
  latest_version: string | null;
}

export interface TokenRow {
  id: number;
  label: string;
  token_prefix: string;
  can_read: number;
  can_write: number;
  created_at: string;
  last_used_at: string | null;
}

export interface TokenSummary extends TokenRow {
  packages: string[];
}

export interface VersionRow {
  id: number;
  package_id: number;
  version: string;
  manifest: string;
  tarball_key: string;
  shasum: string;
  integrity: string;
  published_at: string;
}

const TOKEN_COLUMNS =
  "id, label, token_prefix, can_read, can_write, created_at, last_used_at";

const TOKEN_SUMMARY_SELECT = `SELECT t.id, t.label, t.token_prefix, t.can_read, t.can_write,
    t.created_at, t.last_used_at, json_group_array(p.name) AS package_names
  FROM tokens t
  LEFT JOIN token_packages tp ON tp.token_id = t.id
  LEFT JOIN packages p ON p.id = tp.package_id`;

interface AggregatedTokenRow extends TokenRow {
  package_names: string;
}

function toTokenSummary(row: AggregatedTokenRow): TokenSummary {
  const { package_names, ...token } = row;
  const names = (JSON.parse(package_names) as (string | null)[]).filter(
    function isName(name): name is string {
      return typeof name === "string";
    },
  );
  names.sort();
  return { ...token, packages: names };
}

export async function listPackages(db: D1Database): Promise<PackageSummary[]> {
  const result = await db
    .prepare(
      `SELECT p.id, p.name, p.created_at,
        (SELECT COUNT(*) FROM versions v WHERE v.package_id = p.id) AS version_count,
        (SELECT COUNT(*) FROM token_packages tp WHERE tp.package_id = p.id) AS token_count,
        (SELECT dt.version FROM dist_tags dt WHERE dt.package_id = p.id AND dt.tag = 'latest') AS latest_version
      FROM packages p ORDER BY p.name`,
    )
    .all<PackageSummary>();
  return result.results;
}

export async function getPackageByName(
  db: D1Database,
  name: string,
): Promise<PackageRow | undefined> {
  const row = await db
    .prepare("SELECT * FROM packages WHERE name = ?")
    .bind(name)
    .first<PackageRow>();
  return row ?? undefined;
}

export async function getPackageById(
  db: D1Database,
  id: number,
): Promise<PackageRow | undefined> {
  const row = await db
    .prepare("SELECT * FROM packages WHERE id = ?")
    .bind(id)
    .first<PackageRow>();
  return row ?? undefined;
}

export async function getPackagesByIds(
  db: D1Database,
  ids: number[],
): Promise<PackageRow[]> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(function toPlaceholder() {
    return "?";
  });
  const result = await db
    .prepare(`SELECT * FROM packages WHERE id IN (${placeholders.join(", ")})`)
    .bind(...ids)
    .all<PackageRow>();
  return result.results;
}

export async function createPackage(
  db: D1Database,
  name: string,
): Promise<PackageRow> {
  const row = await db
    .prepare("INSERT INTO packages (name) VALUES (?) RETURNING *")
    .bind(name)
    .first<PackageRow>();
  if (!row) throw new Error("failed to create package");
  return row;
}

export async function deletePackage(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM packages WHERE id = ?").bind(id).run();
  // Tokens whose last package was just deleted no longer grant anything.
  await db
    .prepare(
      "DELETE FROM tokens WHERE id NOT IN (SELECT DISTINCT token_id FROM token_packages)",
    )
    .run();
}

export async function listAllTokens(db: D1Database): Promise<TokenSummary[]> {
  const result = await db
    .prepare(`${TOKEN_SUMMARY_SELECT} GROUP BY t.id ORDER BY t.created_at DESC`)
    .all<AggregatedTokenRow>();
  return result.results.map(toTokenSummary);
}

export async function listTokensForPackage(
  db: D1Database,
  packageId: number,
): Promise<TokenSummary[]> {
  const result = await db
    .prepare(
      `${TOKEN_SUMMARY_SELECT}
      WHERE t.id IN (SELECT token_id FROM token_packages WHERE package_id = ?)
      GROUP BY t.id ORDER BY t.created_at DESC`,
    )
    .bind(packageId)
    .all<AggregatedTokenRow>();
  return result.results.map(toTokenSummary);
}

export interface CreateTokenInput {
  label: string;
  tokenHash: string;
  tokenPrefix: string;
  canRead: boolean;
  canWrite: boolean;
  packageIds: number[];
}

export async function createToken(
  db: D1Database,
  input: CreateTokenInput,
): Promise<TokenRow> {
  const row = await db
    .prepare(
      `INSERT INTO tokens (label, token_hash, token_prefix, can_read, can_write)
      VALUES (?, ?, ?, ?, ?) RETURNING ${TOKEN_COLUMNS}`,
    )
    .bind(
      input.label,
      input.tokenHash,
      input.tokenPrefix,
      input.canRead ? 1 : 0,
      input.canWrite ? 1 : 0,
    )
    .first<TokenRow>();
  if (!row) throw new Error("failed to create token");
  const junction = db.prepare(
    "INSERT INTO token_packages (token_id, package_id) VALUES (?, ?)",
  );
  await db.batch(
    input.packageIds.map(function toStatement(packageId) {
      return junction.bind(row.id, packageId);
    }),
  );
  return row;
}

export async function deleteToken(
  db: D1Database,
  id: number,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM tokens WHERE id = ?")
    .bind(id)
    .run();
  return result.meta.changes > 0;
}

export async function findTokenByHash(
  db: D1Database,
  tokenHash: string,
): Promise<TokenRow | undefined> {
  const row = await db
    .prepare(`SELECT ${TOKEN_COLUMNS} FROM tokens WHERE token_hash = ?`)
    .bind(tokenHash)
    .first<TokenRow>();
  return row ?? undefined;
}

export async function tokenGrantsPackage(
  db: D1Database,
  tokenId: number,
  packageName: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS granted FROM token_packages tp
      JOIN packages p ON p.id = tp.package_id
      WHERE tp.token_id = ? AND p.name = ?`,
    )
    .bind(tokenId, packageName)
    .first<{ granted: number }>();
  return row !== null;
}

export async function touchToken(db: D1Database, id: number): Promise<void> {
  await db
    .prepare(
      "UPDATE tokens SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?",
    )
    .bind(id)
    .run();
}

export async function listVersions(
  db: D1Database,
  packageId: number,
): Promise<VersionRow[]> {
  const result = await db
    .prepare(
      "SELECT * FROM versions WHERE package_id = ? ORDER BY published_at",
    )
    .bind(packageId)
    .all<VersionRow>();
  return result.results;
}

export async function getVersion(
  db: D1Database,
  packageId: number,
  version: string,
): Promise<VersionRow | undefined> {
  const row = await db
    .prepare("SELECT * FROM versions WHERE package_id = ? AND version = ?")
    .bind(packageId, version)
    .first<VersionRow>();
  return row ?? undefined;
}

export interface InsertVersionInput {
  packageId: number;
  version: string;
  manifest: string;
  tarballKey: string;
  shasum: string;
  integrity: string;
}

export async function insertVersion(
  db: D1Database,
  input: InsertVersionInput,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO versions (package_id, version, manifest, tarball_key, shasum, integrity)
      VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.packageId,
      input.version,
      input.manifest,
      input.tarballKey,
      input.shasum,
      input.integrity,
    )
    .run();
}

export async function updateVersionManifest(
  db: D1Database,
  id: number,
  manifest: string,
): Promise<void> {
  await db
    .prepare("UPDATE versions SET manifest = ? WHERE id = ?")
    .bind(manifest, id)
    .run();
}

export async function deleteVersions(
  db: D1Database,
  packageId: number,
  versions: string[],
): Promise<void> {
  if (versions.length === 0) return;
  const placeholders = versions.map(function toPlaceholder() {
    return "?";
  });
  await db
    .prepare(
      `DELETE FROM versions WHERE package_id = ? AND version IN (${placeholders.join(", ")})`,
    )
    .bind(packageId, ...versions)
    .run();
}

export async function deleteAllVersions(
  db: D1Database,
  packageId: number,
): Promise<void> {
  await db
    .prepare("DELETE FROM versions WHERE package_id = ?")
    .bind(packageId)
    .run();
}

export async function getDistTags(
  db: D1Database,
  packageId: number,
): Promise<Record<string, string>> {
  const result = await db
    .prepare("SELECT tag, version FROM dist_tags WHERE package_id = ?")
    .bind(packageId)
    .all<{ tag: string; version: string }>();
  const tags: Record<string, string> = {};
  for (const row of result.results) {
    tags[row.tag] = row.version;
  }
  return tags;
}

export async function setDistTag(
  db: D1Database,
  packageId: number,
  tag: string,
  version: string,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO dist_tags (package_id, tag, version) VALUES (?, ?, ?)
      ON CONFLICT (package_id, tag) DO UPDATE SET version = excluded.version`,
    )
    .bind(packageId, tag, version)
    .run();
}

export async function deleteDistTag(
  db: D1Database,
  packageId: number,
  tag: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM dist_tags WHERE package_id = ? AND tag = ?")
    .bind(packageId, tag)
    .run();
}

export async function replaceDistTags(
  db: D1Database,
  packageId: number,
  tags: Record<string, string>,
): Promise<void> {
  await db
    .prepare("DELETE FROM dist_tags WHERE package_id = ?")
    .bind(packageId)
    .run();
  for (const [tag, version] of Object.entries(tags)) {
    await setDistTag(db, packageId, tag, version);
  }
}
