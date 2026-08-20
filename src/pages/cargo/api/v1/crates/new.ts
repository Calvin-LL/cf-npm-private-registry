import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import {
  authenticateCargoPackage,
  cargoError,
  parseCargoPublishBody,
  publishCargoCrate,
} from "@/lib/cargoRegistry";

export const prerender = false;

export async function PUT(context: APIContext): Promise<Response> {
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await context.request.arrayBuffer());
  } catch {
    return cargoError(400, "could not read Cargo publish body");
  }
  const parsed = parseCargoPublishBody(bytes);
  if (!parsed.ok) return cargoError(400, parsed.detail);
  function waitUntil(promise: Promise<unknown>): void {
    context.locals.cfContext.waitUntil(promise);
  }
  const auth = await authenticateCargoPackage(
    context.request,
    env.DB,
    parsed.metadata.name,
    "write",
    waitUntil,
    `${context.url.origin}/`,
  );
  if (!auth.ok) return auth.response;
  return publishCargoCrate(env, parsed.metadata, parsed.crate);
}
