import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { authenticateCargoPackage, cargoError } from "@/lib/cargoRegistry";
import { getCargoVersion, getPackageByName } from "@/lib/db";

export const prerender = false;

async function download(
  context: APIContext,
  includeBody: boolean,
): Promise<Response> {
  const name = context.params.crate ?? "";
  const version = context.params.version ?? "";
  const pkg = await getPackageByName(env.DB, name, "cargo");
  if (pkg === undefined) return cargoError(404, `crate not found: ${name}`);
  function waitUntil(promise: Promise<unknown>): void {
    context.locals.cfContext.waitUntil(promise);
  }
  const auth = await authenticateCargoPackage(
    context.request,
    env.DB,
    pkg.name,
    "read",
    waitUntil,
    `${context.url.origin}/`,
  );
  if (!auth.ok) return auth.response;
  const cargoVersion = await getCargoVersion(env.DB, pkg.id, version);
  if (cargoVersion === undefined) {
    return cargoError(404, `crate version not found: ${name} ${version}`);
  }
  const object = await env.TARBALLS.get(cargoVersion.tarball_key);
  if (object === null) return cargoError(404, "crate archive not found");
  return new Response(includeBody ? object.body : undefined, {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(object.size),
      "cache-control": "private, max-age=31536000, immutable",
      etag: object.httpEtag,
    },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  return download(context, true);
}

export async function HEAD(context: APIContext): Promise<Response> {
  return download(context, false);
}
