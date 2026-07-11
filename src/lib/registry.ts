import { sha256Hex } from "@/lib/auth";
import {
  findTokenByHash,
  tokenGrantsPackage,
  touchToken,
  type TokenRow,
} from "@/lib/db";

// A single package name may not exceed this many characters (npm rule).
const MAX_PACKAGE_NAME_LENGTH = 214;
export const PACKAGE_NAME_PATTERN =
  /^@[a-z0-9~-][a-z0-9._~-]*\/[a-z0-9~-][a-z0-9._~-]*$/;

export function isValidPackageName(name: string): boolean {
  return (
    name.length <= MAX_PACKAGE_NAME_LENGTH && PACKAGE_NAME_PATTERN.test(name)
  );
}

export type RegistryPath =
  | { kind: "ping" }
  | { kind: "whoami" }
  | { kind: "user" }
  | { kind: "distTags"; name: string; tag: string | undefined }
  | { kind: "packument"; name: string }
  | { kind: "tarball"; name: string; filename: string; rev: string | undefined }
  | { kind: "revDoc"; name: string; rev: string }
  | { kind: "other" };

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// Parses a raw (still percent-encoded) URL pathname into an npm registry
// route. npm encodes the slash of scoped names for packument requests
// ("/@scope%2fname") but not for tarball downloads ("/@scope/name/-/x.tgz"),
// so both spellings must resolve to the same package.
export function parseRegistryPath(rawPathname: string): RegistryPath {
  const segments = rawPathname
    .replace(/\/+$/, "")
    .split("/")
    .slice(1)
    .map(decodeSegment);
  if (segments.length === 0 || segments[0] === "") return { kind: "other" };

  if (segments[0] === "-") {
    if (segments[1] === "ping") return { kind: "ping" };
    if (segments[1] === "whoami") return { kind: "whoami" };
    if (segments[1] === "user") return { kind: "user" };
    if (
      segments[1] === "package" &&
      segments.length >= 4 &&
      segments[3] === "dist-tags"
    ) {
      return {
        kind: "distTags",
        name: decodeSegment(segments[2]!),
        tag: segments[4],
      };
    }
    return { kind: "other" };
  }

  let name: string;
  let rest: string[];
  if (segments[0]!.startsWith("@") && !segments[0]!.includes("/")) {
    if (segments.length < 2) return { kind: "other" };
    name = `${segments[0]}/${segments[1]}`;
    rest = segments.slice(2);
  } else {
    name = segments[0]!;
    rest = segments.slice(1);
  }

  if (rest.length === 0) return { kind: "packument", name };
  if (rest[0] === "-" && rest.length === 2) {
    return { kind: "tarball", name, filename: rest[1]!, rev: undefined };
  }
  if (rest[0] === "-" && rest.length === 4 && rest[2] === "-rev") {
    return { kind: "tarball", name, filename: rest[1]!, rev: rest[3] };
  }
  if (rest[0] === "-rev" && rest.length === 2)
    return { kind: "revDoc", name, rev: rest[1]! };
  return { kind: "other" };
}

export function npmError(status: number, message: string): Response {
  return Response.json(
    { error: message },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export function npmJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function bearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization");
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : undefined;
}

export type RegistryAuth =
  { ok: true; token: TokenRow } | { ok: false; response: Response };

export async function authenticate(
  request: Request,
  db: D1Database,
  packageName: string,
  permission: "read" | "write",
  waitUntil: (promise: Promise<unknown>) => void,
): Promise<RegistryAuth> {
  const token = bearerToken(request);
  if (!token) {
    return {
      ok: false,
      response: npmError(
        401,
        `authentication required: put a token for ${packageName} in your .npmrc`,
      ),
    };
  }
  const found = await findTokenByHash(db, await sha256Hex(token));
  if (!found) {
    return { ok: false, response: npmError(401, "invalid or revoked token") };
  }
  if (!(await tokenGrantsPackage(db, found.id, packageName))) {
    return {
      ok: false,
      response: npmError(
        403,
        `this token does not grant access to ${packageName}`,
      ),
    };
  }
  const allowed =
    permission === "read" ? found.can_read === 1 : found.can_write === 1;
  if (!allowed) {
    return {
      ok: false,
      response: npmError(
        403,
        `this token does not grant ${permission} access to ${packageName}`,
      ),
    };
  }
  waitUntil(touchToken(db, found.id));
  return { ok: true, token: found };
}

export interface VersionManifest {
  name?: string;
  version?: string;
  deprecated?: string;
  dist?: Record<string, unknown>;
  [key: string]: unknown;
}

export function tarballFilename(packageName: string, version: string): string {
  const basename = packageName.split("/").pop();
  return `${basename}-${version}.tgz`;
}

export function tarballKey(packageName: string, filename: string): string {
  return `${packageName}/-/${filename}`;
}

export function tarballUrl(
  origin: string,
  packageName: string,
  filename: string,
): string {
  return `${origin}/${packageName}/-/${filename}`;
}

export function decodeBase64(data: string): Uint8Array {
  const withFromBase64 = Uint8Array as unknown as {
    fromBase64?: (input: string) => Uint8Array;
  };
  if (withFromBase64.fromBase64) return withFromBase64.fromBase64(data);
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toBase64(bytes: Uint8Array): string {
  const withToBase64 = bytes as unknown as { toBase64?: () => string };
  if (withToBase64.toBase64) return withToBase64.toBase64();
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

export interface TarballDigests {
  shasum: string;
  integrity: string;
}

export async function digestTarball(
  bytes: Uint8Array,
): Promise<TarballDigests> {
  const buffer = bytes.buffer as ArrayBuffer;
  const view = new Uint8Array(buffer, bytes.byteOffset, bytes.byteLength);
  const [sha1, sha512] = await Promise.all([
    crypto.subtle.digest("SHA-1", view),
    crypto.subtle.digest("SHA-512", view),
  ]);
  return {
    shasum: toHex(new Uint8Array(sha1)),
    integrity: `sha512-${toBase64(new Uint8Array(sha512))}`,
  };
}

// Proxies a request for a package this registry does not host to the public
// upstream registry. The Authorization header is intentionally not forwarded.
export async function proxyToUpstream(
  request: Request,
  upstreamRegistry: string,
  url: URL,
): Promise<Response> {
  const target = `${upstreamRegistry}${url.pathname}${url.search}`;
  const headers = new Headers();
  const accept = request.headers.get("accept");
  if (accept) headers.set("accept", accept);
  const init: RequestInit = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    headers.set(
      "content-type",
      request.headers.get("content-type") ?? "application/json",
    );
    init.body = await request.arrayBuffer();
  }
  const upstream = await fetch(target, init);
  const responseHeaders = new Headers({ "cache-control": "no-store" });
  const contentType = upstream.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);
  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}
