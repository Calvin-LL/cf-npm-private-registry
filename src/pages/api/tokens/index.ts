import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { generateToken, sha256Hex, TOKEN_PREFIX_LENGTH } from "@/lib/auth";
import { createToken, getPackagesByIds, listAllTokens } from "@/lib/db";

export const prerender = false;

export async function GET(): Promise<Response> {
  return Response.json(await listAllTokens(env.DB));
}

export async function POST(context: APIContext): Promise<Response> {
  let body: {
    label?: unknown;
    canRead?: unknown;
    canWrite?: unknown;
    packageIds?: unknown;
  };
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
      { status: 400 },
    );
  }
  if (!canRead && !canWrite) {
    return Response.json(
      { error: "token needs at least one of read or write" },
      { status: 400 },
    );
  }
  const packageIds = Array.isArray(body.packageIds)
    ? [...new Set(body.packageIds)]
    : [];
  if (
    packageIds.length === 0 ||
    !packageIds.every(function isId(id) {
      return Number.isInteger(id);
    })
  ) {
    return Response.json(
      { error: "select at least one package for this token" },
      { status: 400 },
    );
  }
  const packages = await getPackagesByIds(env.DB, packageIds as number[]);
  if (packages.length !== packageIds.length) {
    return Response.json(
      { error: "one or more selected packages do not exist" },
      { status: 400 },
    );
  }
  const token = generateToken();
  const row = await createToken(env.DB, {
    label,
    tokenHash: await sha256Hex(token),
    tokenPrefix: token.slice(0, TOKEN_PREFIX_LENGTH),
    canRead,
    canWrite,
    packageIds: packageIds as number[],
  });
  const names = packages
    .map(function toName(pkg) {
      return pkg.name;
    })
    .sort();
  return Response.json(
    { token, row: { ...row, packages: names } },
    { status: 201 },
  );
}
