import type { APIContext } from "astro";
import { createPackage, getPackageByName, listPackages } from "@/lib/db";
import { isValidPackageName } from "@/lib/registry";

export const prerender = false;

export async function GET(context: APIContext): Promise<Response> {
  const env = context.locals.runtime.env;
  return Response.json(await listPackages(env.DB));
}

export async function POST(context: APIContext): Promise<Response> {
  const env = context.locals.runtime.env;
  let body: { name?: unknown };
  try {
    body = (await context.request.json()) as { name?: unknown };
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!isValidPackageName(name)) {
    return Response.json(
      {
        error:
          "package names must be scoped and lowercase, like @myscope/my-package",
      },
      { status: 400 },
    );
  }
  if (await getPackageByName(env.DB, name)) {
    return Response.json({ error: `${name} already exists` }, { status: 409 });
  }
  const pkg = await createPackage(env.DB, name);
  return Response.json(pkg, { status: 201 });
}
