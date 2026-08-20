import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { authenticateCargoToken } from "@/lib/cargoRegistry";

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  function waitUntil(promise: Promise<unknown>): void {
    context.locals.cfContext.waitUntil(promise);
  }
  const auth = await authenticateCargoToken(
    context.request,
    env.DB,
    waitUntil,
    `${context.url.origin}/`,
  );
  if (!auth.ok) return auth.response;
  return Response.json(
    {
      dl: `${context.url.origin}/cargo/api/v1/crates`,
      api: `${context.url.origin}/cargo`,
      "auth-required": true,
    },
    { headers: { "cache-control": "private, max-age=3600" } },
  );
}
