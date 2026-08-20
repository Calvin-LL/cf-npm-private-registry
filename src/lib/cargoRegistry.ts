import { sha256Hex } from "@/lib/auth";
import {
  findTokenByHash,
  getCargoVersionByVersionKey,
  getPackageByName,
  insertCargoVersion,
  listCargoVersions,
  normalizePackageName,
  tokenGrantsPackage,
  touchToken,
  type PackageRow,
  type TokenRow,
} from "@/lib/db";

const MAX_CRATE_SIZE = 50 * 1024 * 1024;
const CARGO_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

interface CargoPublishDependency {
  name: string;
  version_req: string;
  features?: string[];
  optional?: boolean;
  default_features?: boolean;
  target?: string | null;
  kind?: "normal" | "build" | "dev" | null;
  registry?: string | null;
  explicit_name_in_toml?: string | null;
}

export interface CargoPublishMetadata {
  name: string;
  vers: string;
  deps: CargoPublishDependency[];
  features: Record<string, string[]>;
  links?: string | null;
  rust_version?: string | null;
}

interface CargoIndexDependency {
  name: string;
  req: string;
  features: string[];
  optional: boolean;
  default_features: boolean;
  target: string | null;
  kind: "normal" | "build" | "dev" | null;
  registry: string | null;
  package?: string;
}

interface CargoIndexEntry {
  name: string;
  vers: string;
  deps: CargoIndexDependency[];
  cksum: string;
  features: Record<string, string[]>;
  yanked: boolean;
  links: string | null;
  rust_version?: string;
}

export type CargoAuthResult =
  { ok: true; token: TokenRow } | { ok: false; response: Response };

export function isValidCargoPackageName(name: string): boolean {
  return CARGO_NAME_PATTERN.test(name);
}

export function cargoIndexPath(name: string): string {
  const normalized = normalizePackageName(name, "cargo");
  if (normalized.length === 1) return `1/${normalized}`;
  if (normalized.length === 2) return `2/${normalized}`;
  if (normalized.length === 3) {
    return `3/${normalized[0]}/${normalized}`;
  }
  return `${normalized.slice(0, 2)}/${normalized.slice(2, 4)}/${normalized}`;
}

export function cargoTarballKey(name: string, version: string): string {
  const normalized = normalizePackageName(name, "cargo");
  return `cargo/${normalized}/${version}/${normalized}-${version}.crate`;
}

export function cargoError(status: number, detail: string): Response {
  return Response.json(
    { errors: [{ detail }] },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export function cargoAuthorizationToken(request: Request): string | undefined {
  const value = request.headers.get("authorization")?.trim();
  if (value === undefined || value.length === 0) return undefined;
  const bearer = /^Bearer\s+(.+)$/i.exec(value);
  return bearer?.[1] ?? value;
}

export async function authenticateCargoToken(
  request: Request,
  db: D1Database,
  waitUntil: (promise: Promise<unknown>) => void,
  loginUrl: string,
): Promise<CargoAuthResult> {
  const token = cargoAuthorizationToken(request);
  if (token === undefined) {
    return {
      ok: false,
      response: new Response(undefined, {
        status: 401,
        headers: {
          "cache-control": "no-store",
          "www-authenticate": `Cargo login_url="${loginUrl}"`,
        },
      }),
    };
  }
  const found = await findTokenByHash(db, await sha256Hex(token));
  if (found === undefined) {
    return { ok: false, response: cargoError(403, "invalid or revoked token") };
  }
  waitUntil(touchToken(db, found.id));
  return { ok: true, token: found };
}

export async function authenticateCargoPackage(
  request: Request,
  db: D1Database,
  packageName: string,
  permission: "read" | "write",
  waitUntil: (promise: Promise<unknown>) => void,
  loginUrl: string,
): Promise<CargoAuthResult> {
  const auth = await authenticateCargoToken(request, db, waitUntil, loginUrl);
  if (!auth.ok) return auth;
  if (!(await tokenGrantsPackage(db, auth.token.id, packageName, "cargo"))) {
    return {
      ok: false,
      response: cargoError(
        403,
        `this token does not grant access to ${packageName}`,
      ),
    };
  }
  const allowed =
    permission === "read"
      ? auth.token.can_read === 1
      : auth.token.can_write === 1;
  if (!allowed) {
    return {
      ok: false,
      response: cargoError(
        403,
        `this token does not grant ${permission} access to ${packageName}`,
      ),
    };
  }
  return auth;
}

function readUint32(bytes: Uint8Array, offset: number): number | undefined {
  if (offset + 4 > bytes.length) return undefined;
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(
    0,
    true,
  );
}

export function parseCargoPublishBody(
  bytes: Uint8Array,
):
  | { ok: true; metadata: CargoPublishMetadata; crate: Uint8Array }
  | { ok: false; detail: string } {
  if (bytes.length > MAX_CRATE_SIZE + 1024 * 1024) {
    return { ok: false, detail: "crate upload is too large" };
  }
  const metadataLength = readUint32(bytes, 0);
  if (metadataLength === undefined || metadataLength > 1024 * 1024) {
    return { ok: false, detail: "invalid Cargo publish metadata length" };
  }
  const metadataStart = 4;
  const metadataEnd = metadataStart + metadataLength;
  const crateLength = readUint32(bytes, metadataEnd);
  if (crateLength === undefined || crateLength > MAX_CRATE_SIZE) {
    return { ok: false, detail: "invalid Cargo crate length" };
  }
  const crateStart = metadataEnd + 4;
  if (crateStart + crateLength !== bytes.length) {
    return { ok: false, detail: "Cargo publish body length does not match" };
  }
  let metadata: CargoPublishMetadata;
  try {
    metadata = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(
        bytes.subarray(metadataStart, metadataEnd),
      ),
    ) as CargoPublishMetadata;
  } catch {
    return { ok: false, detail: "invalid Cargo publish metadata JSON" };
  }
  return {
    ok: true,
    metadata,
    crate: bytes.subarray(crateStart),
  };
}

function isValidPublishMetadata(metadata: CargoPublishMetadata): boolean {
  return (
    typeof metadata.name === "string" &&
    isValidCargoPackageName(metadata.name) &&
    typeof metadata.vers === "string" &&
    SEMVER_PATTERN.test(metadata.vers) &&
    Array.isArray(metadata.deps) &&
    metadata.deps.every(function isDependency(dependency) {
      return (
        typeof dependency.name === "string" &&
        typeof dependency.version_req === "string"
      );
    }) &&
    typeof metadata.features === "object" &&
    metadata.features !== null
  );
}

function toIndexDependency(
  dependency: CargoPublishDependency,
): CargoIndexDependency {
  const renamed = dependency.explicit_name_in_toml;
  return {
    name: renamed ?? dependency.name,
    req: dependency.version_req,
    features: dependency.features ?? [],
    optional: dependency.optional ?? false,
    default_features: dependency.default_features ?? true,
    target: dependency.target ?? null,
    kind: dependency.kind ?? "normal",
    registry: dependency.registry ?? null,
    ...(renamed !== undefined && renamed !== null
      ? { package: dependency.name }
      : {}),
  };
}

async function sha256BytesHex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(digest)]
    .map(function toHex(byte) {
      return byte.toString(16).padStart(2, "0");
    })
    .join("");
}

export async function publishCargoCrate(
  env: Env,
  metadata: CargoPublishMetadata,
  crate: Uint8Array,
): Promise<Response> {
  if (!isValidPublishMetadata(metadata)) {
    return cargoError(400, "invalid Cargo package metadata");
  }
  const pkg = await getPackageByName(env.DB, metadata.name, "cargo");
  if (pkg === undefined) {
    return cargoError(
      404,
      `crate ${metadata.name} does not exist, create it in the registry UI first`,
    );
  }
  const existing = await getCargoVersionByVersionKey(
    env.DB,
    pkg.id,
    metadata.vers,
  );
  if (existing !== undefined) {
    return cargoError(
      403,
      `crate ${metadata.name} ${metadata.vers} has already been published`,
    );
  }
  const checksum = await sha256BytesHex(crate);
  const entry: CargoIndexEntry = {
    name: metadata.name,
    vers: metadata.vers,
    deps: metadata.deps.map(toIndexDependency),
    cksum: checksum,
    features: metadata.features,
    yanked: false,
    links: metadata.links ?? null,
    ...(typeof metadata.rust_version === "string"
      ? { rust_version: metadata.rust_version }
      : {}),
  };
  const key = cargoTarballKey(metadata.name, metadata.vers);
  await env.TARBALLS.put(key, crate, {
    httpMetadata: { contentType: "application/octet-stream" },
  });
  try {
    await insertCargoVersion(env.DB, {
      packageId: pkg.id,
      version: metadata.vers,
      indexEntry: JSON.stringify(entry),
      tarballKey: key,
      checksum,
    });
  } catch (cause) {
    await env.TARBALLS.delete(key);
    throw cause;
  }
  return Response.json({
    warnings: { invalid_categories: [], invalid_badges: [], other: [] },
  });
}

export async function cargoIndexResponse(
  request: Request,
  db: D1Database,
  pkg: PackageRow,
): Promise<Response> {
  const versions = await listCargoVersions(db, pkg.id);
  if (versions.length === 0) {
    return cargoError(404, `no versions of ${pkg.name} have been published`);
  }
  const body = `${versions
    .map(function toEntry(row) {
      return row.index_entry;
    })
    .join("\n")}\n`;
  const etag = `"${await sha256Hex(body)}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(undefined, {
      status: 304,
      headers: { etag, "cache-control": "private, max-age=0" },
    });
  }
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "private, max-age=0",
      etag,
    },
  });
}
