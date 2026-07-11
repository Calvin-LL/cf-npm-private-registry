import type { APIContext } from "astro";
import { deleteToken } from "@/lib/db";

export const prerender = false;

export async function DELETE(context: APIContext): Promise<Response> {
  const env = context.locals.runtime.env;
  const id = Number(context.params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "invalid token id" }, { status: 400 });
  }
  const deleted = await deleteToken(env.DB, id);
  if (!deleted) {
    return Response.json({ error: "token not found" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
