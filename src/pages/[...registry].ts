import type { APIContext } from "astro";
import { sha256Hex } from "@/lib/auth";
import { getRuntimeConfig } from "@/lib/config";
import {
  deleteAllVersions,
  deleteDistTag,
  deleteVersions,
  findTokenByHash,
  getDistTags,
  getPackageByName,
  getVersion,
  insertVersion,
  listVersions,
  replaceDistTags,
  setDistTag,
  updateVersionManifest,
  type PackageRow,
} from "@/lib/db";
import {
  authenticate,
  bearerToken,
  decodeBase64,
  digestTarball,
  npmError,
  npmJson,
  parseRegistryPath,
  proxyToUpstream,
  tarballFilename,
  tarballKey,
  tarballUrl,
  type VersionManifest,
} from "@/lib/registry";

export const prerender = false;

interface PublishAttachment {
  content_type?: string;
  data?: string;
  length?: number;
}

interface PublishBody {
  _id?: string;
  name?: string;
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, VersionManifest>;
  _attachments?: Record<string, PublishAttachment>;
}

export async function ALL(context: APIContext): Promise<Response> {
  const { request, locals } = context;
  const env = locals.runtime.env;
  const config = getRuntimeConfig(env);
  const url = new URL(request.url);
  const parsed = parseRegistryPath(url.pathname);
  const method = request.method.toUpperCase();

  function waitUntil(promise: Promise<unknown>): void {
    locals.runtime.ctx.waitUntil(promise);
  }

  async function maybeProxy(): Promise<Response> {
    if (
      config.proxyUpstream &&
      (method === "GET" || method === "HEAD" || method === "POST")
    ) {
      return proxyToUpstream(request, config.upstreamRegistry, url);
    }
    return npmError(404, `package not found: ${url.pathname}`);
  }

  switch (parsed.kind) {
    case "ping":
      return npmJson({});

    case "whoami": {
      const token = bearerToken(request);
      if (!token) return npmError(401, "authentication required");
      const found = await findTokenByHash(env.DB, await sha256Hex(token));
      if (!found) return npmError(401, "invalid or revoked token");
      return npmJson({ username: `${found.token.label} (${found.pkg.name})` });
    }

    case "user":
      return npmError(
        405,
        "this registry does not support npm login; create a token in the web UI and put it in your .npmrc",
      );

    case "distTags":
      return handleDistTags(
        context,
        parsed.name,
        parsed.tag,
        maybeProxy,
        waitUntil,
      );

    case "packument": {
      const pkg = await getPackageByName(env.DB, parsed.name);
      if (!pkg) return maybeProxy();
      if (method === "GET" || method === "HEAD") {
        const auth = await authenticate(
          request,
          env.DB,
          parsed.name,
          "read",
          waitUntil,
        );
        if (!auth.ok) return auth.response;
        return servePackument(env.DB, pkg, url.origin);
      }
      if (method === "PUT") {
        const auth = await authenticate(
          request,
          env.DB,
          parsed.name,
          "write",
          waitUntil,
        );
        if (!auth.ok) return auth.response;
        return handlePublish(context, pkg);
      }
      return npmError(405, `unsupported method ${method}`);
    }

    case "revDoc": {
      const pkg = await getPackageByName(env.DB, parsed.name);
      if (!pkg) return npmError(404, `package not found: ${parsed.name}`);
      const auth = await authenticate(
        request,
        env.DB,
        parsed.name,
        "write",
        waitUntil,
      );
      if (!auth.ok) return auth.response;
      if (method === "PUT") return handleUnpublishSync(context, pkg);
      if (method === "DELETE") return handleUnpublishAll(context, pkg);
      return npmError(405, `unsupported method ${method}`);
    }

    case "tarball": {
      const pkg = await getPackageByName(env.DB, parsed.name);
      if (!pkg) return maybeProxy();
      if (method === "GET" || method === "HEAD") {
        const auth = await authenticate(
          request,
          env.DB,
          parsed.name,
          "read",
          waitUntil,
        );
        if (!auth.ok) return auth.response;
        return serveTarball(env, parsed.name, parsed.filename);
      }
      if (method === "DELETE") {
        const auth = await authenticate(
          request,
          env.DB,
          parsed.name,
          "write",
          waitUntil,
        );
        if (!auth.ok) return auth.response;
        await env.TARBALLS.delete(tarballKey(parsed.name, parsed.filename));
        return npmJson({ ok: true });
      }
      return npmError(405, `unsupported method ${method}`);
    }

    default:
      return maybeProxy();
  }
}

async function servePackument(
  db: D1Database,
  pkg: PackageRow,
  origin: string,
): Promise<Response> {
  const versions = await listVersions(db, pkg.id);
  if (versions.length === 0) {
    return npmError(404, `no versions of ${pkg.name} have been published yet`);
  }
  const distTags = await getDistTags(db, pkg.id);
  const versionMap: Record<string, VersionManifest> = {};
  const time: Record<string, string> = { created: pkg.created_at };
  for (const row of versions) {
    const manifest = JSON.parse(row.manifest) as VersionManifest;
    const filename = row.tarball_key.split("/").pop()!;
    manifest.dist = {
      ...manifest.dist,
      tarball: tarballUrl(origin, pkg.name, filename),
      shasum: row.shasum,
      integrity: row.integrity,
    };
    versionMap[row.version] = manifest;
    time[row.version] = row.published_at;
  }
  time.modified = versions[versions.length - 1]!.published_at;
  return npmJson({
    _id: pkg.name,
    _rev: `${versions.length}-${pkg.id}`,
    name: pkg.name,
    "dist-tags": distTags,
    versions: versionMap,
    time,
  });
}

async function serveTarball(
  env: Env,
  name: string,
  filename: string,
): Promise<Response> {
  const object = await env.TARBALLS.get(tarballKey(name, filename));
  if (!object) return npmError(404, `tarball not found: ${filename}`);
  return new Response(object.body, {
    status: 200,
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(object.size),
      "cache-control": "no-store",
      etag: object.httpEtag,
    },
  });
}

async function handlePublish(
  context: APIContext,
  pkg: PackageRow,
): Promise<Response> {
  const env = context.locals.runtime.env;
  let body: PublishBody;
  try {
    body = (await context.request.json()) as PublishBody;
  } catch {
    return npmError(400, "invalid JSON body");
  }
  if (body.name !== pkg.name) {
    return npmError(
      400,
      `package name mismatch: body says ${body.name}, URL says ${pkg.name}`,
    );
  }

  const attachments = Object.entries(body._attachments ?? {});
  if (attachments.length === 0) return handleMetadataUpdate(env.DB, pkg, body);

  const versionEntries = Object.entries(body.versions ?? {});
  if (attachments.length !== 1 || versionEntries.length !== 1) {
    return npmError(
      400,
      "expected exactly one version and one attachment per publish",
    );
  }
  const [version, manifest] = versionEntries[0]!;
  const [attachmentName, attachment] = attachments[0]!;
  if (!attachment.data)
    return npmError(400, `attachment ${attachmentName} has no data`);
  if (!/^\d+\.\d+\.\d+/.test(version))
    return npmError(400, `invalid version: ${version}`);

  const existing = await getVersion(env.DB, pkg.id, version);
  if (existing) {
    return npmError(
      403,
      `cannot modify pre-existing version: ${pkg.name}@${version} already exists`,
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = decodeBase64(attachment.data);
  } catch {
    return npmError(400, `attachment ${attachmentName} is not valid base64`);
  }
  const digests = await digestTarball(bytes);
  const clientIntegrity = manifest.dist?.integrity;
  if (
    typeof clientIntegrity === "string" &&
    clientIntegrity !== digests.integrity
  ) {
    return npmError(
      400,
      "integrity mismatch between uploaded tarball and manifest",
    );
  }

  const filename = tarballFilename(pkg.name, version);
  const key = tarballKey(pkg.name, filename);
  await env.TARBALLS.put(key, bytes, {
    httpMetadata: { contentType: "application/octet-stream" },
  });

  const storedManifest: VersionManifest = { ...manifest };
  delete storedManifest._attachments;
  await insertVersion(env.DB, {
    packageId: pkg.id,
    version,
    manifest: JSON.stringify(storedManifest),
    tarballKey: key,
    shasum: digests.shasum,
    integrity: digests.integrity,
  });
  for (const [tag, taggedVersion] of Object.entries(body["dist-tags"] ?? {})) {
    await setDistTag(env.DB, pkg.id, tag, taggedVersion);
  }
  return npmJson({ ok: true, id: pkg.name, rev: `1-${pkg.id}` }, 201);
}

// npm deprecate sends the full packument back with `deprecated` fields set
// and no attachments; sync those fields onto the stored manifests.
async function handleMetadataUpdate(
  db: D1Database,
  pkg: PackageRow,
  body: PublishBody,
): Promise<Response> {
  const rows = await listVersions(db, pkg.id);
  for (const row of rows) {
    const incoming = body.versions?.[row.version];
    if (!incoming) continue;
    const stored = JSON.parse(row.manifest) as VersionManifest;
    if (incoming.deprecated === stored.deprecated) continue;
    if (incoming.deprecated === undefined || incoming.deprecated === "") {
      delete stored.deprecated;
    } else {
      stored.deprecated = incoming.deprecated;
    }
    await updateVersionManifest(db, row.id, JSON.stringify(stored));
  }
  for (const [tag, taggedVersion] of Object.entries(body["dist-tags"] ?? {})) {
    await setDistTag(db, pkg.id, tag, taggedVersion);
  }
  return npmJson({ ok: true });
}

// npm unpublish of a single version PUTs the packument with that version
// removed; delete whatever is no longer referenced.
async function handleUnpublishSync(
  context: APIContext,
  pkg: PackageRow,
): Promise<Response> {
  const env = context.locals.runtime.env;
  let body: PublishBody;
  try {
    body = (await context.request.json()) as PublishBody;
  } catch {
    return npmError(400, "invalid JSON body");
  }
  const keep = new Set(Object.keys(body.versions ?? {}));
  const rows = await listVersions(env.DB, pkg.id);
  const removed = rows.filter(function isRemoved(row) {
    return !keep.has(row.version);
  });
  if (removed.length > 0) {
    await env.TARBALLS.delete(
      removed.map(function toKey(row) {
        return row.tarball_key;
      }),
    );
    await deleteVersions(
      env.DB,
      pkg.id,
      removed.map(function toVersion(row) {
        return row.version;
      }),
    );
  }
  await replaceDistTags(env.DB, pkg.id, body["dist-tags"] ?? {});
  return npmJson({ ok: true });
}

// npm unpublish --force deletes the whole packument. The package row and its
// tokens survive so the repo can be re-published to from the UI setup.
async function handleUnpublishAll(
  context: APIContext,
  pkg: PackageRow,
): Promise<Response> {
  const env = context.locals.runtime.env;
  const rows = await listVersions(env.DB, pkg.id);
  if (rows.length > 0) {
    await env.TARBALLS.delete(
      rows.map(function toKey(row) {
        return row.tarball_key;
      }),
    );
  }
  await deleteAllVersions(env.DB, pkg.id);
  await replaceDistTags(env.DB, pkg.id, {});
  return npmJson({ ok: true });
}

async function handleDistTags(
  context: APIContext,
  name: string,
  tag: string | undefined,
  maybeProxy: () => Promise<Response>,
  waitUntil: (promise: Promise<unknown>) => void,
): Promise<Response> {
  const env = context.locals.runtime.env;
  const method = context.request.method.toUpperCase();
  const pkg = await getPackageByName(env.DB, name);
  if (!pkg) return maybeProxy();

  if (method === "GET") {
    const auth = await authenticate(
      context.request,
      env.DB,
      name,
      "read",
      waitUntil,
    );
    if (!auth.ok) return auth.response;
    return npmJson(await getDistTags(env.DB, pkg.id));
  }
  if (method === "PUT" && tag) {
    const auth = await authenticate(
      context.request,
      env.DB,
      name,
      "write",
      waitUntil,
    );
    if (!auth.ok) return auth.response;
    let version: unknown;
    try {
      version = await context.request.json();
    } catch {
      return npmError(400, "invalid JSON body");
    }
    if (typeof version !== "string")
      return npmError(400, "expected a version string");
    const existing = await getVersion(env.DB, pkg.id, version);
    if (!existing)
      return npmError(404, `version not found: ${name}@${version}`);
    await setDistTag(env.DB, pkg.id, tag, version);
    return npmJson({ ok: true }, 201);
  }
  if (method === "DELETE" && tag) {
    const auth = await authenticate(
      context.request,
      env.DB,
      name,
      "write",
      waitUntil,
    );
    if (!auth.ok) return auth.response;
    await deleteDistTag(env.DB, pkg.id, tag);
    return npmJson({ ok: true });
  }
  return npmError(405, `unsupported method ${method}`);
}
