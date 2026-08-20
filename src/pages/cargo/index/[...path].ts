import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import {
  authenticateCargoPackage,
  cargoError,
  cargoIndexPath,
  cargoIndexResponse,
} from "@/lib/cargoRegistry";
import { getPackageByName } from "@/lib/db";

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const path = context.params.path ?? "";
  const name = path.split("/").at(-1) ?? "";
  if (cargoIndexPath(name) !== path) {
    return cargoError(404, "crate not found");
  }
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
  return cargoIndexResponse(context.request, env.DB, pkg);
}
