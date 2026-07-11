import type { APIContext } from "astro";
import { generateToken, sha256Hex, TOKEN_PREFIX_LENGTH } from "@/lib/auth";
import { createToken, getPackageById, listTokens } from "@/lib/db";

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const env = context.locals.runtime.env;
  const id = Number(context.params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "invalid package id" }, { status: 400 });
  }
  return Response.json(await listTokens(env.DB, id));
}

export async function POST(context: APIContext): Promise<Response> {
  const env = context.locals.runtime.env;
  const id = Number(context.params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "invalid package id" }, { status: 400 });
  }
  const pkg = await getPackageById(env.DB, id);
  if (!pkg) {
    return Response.json({ error: "package not found" }, { status: 404 });
  }
  let body: { label?: unknown; canRead?: unknown; canWrite?: unknown };
  try {
    body = (await context.request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const canRead = body.canRead === true;
  const canWrite = body.canWrite === true;
  if (label.length === 0 || label.length > 100) {
    return Response.json(
      { error: "a label between 1 and 100 characters is required" },
      {
        status: 400,
      },
    );
  }
  if (!canRead && !canWrite) {
    return Response.json(
      { error: "token needs at least one of read or write" },
      { status: 400 },
    );
  }
  const token = generateToken();
  const row = await createToken(env.DB, {
    packageId: id,
    label,
    tokenHash: await sha256Hex(token),
    tokenPrefix: token.slice(0, TOKEN_PREFIX_LENGTH),
    canRead,
    canWrite,
  });
  return Response.json({ token, row }, { status: 201 });
}
