import type { APIContext } from "astro";
import { env } from "cloudflare:workers";
import { isValidCargoPackageName } from "@/lib/cargoRegistry";
import { createPackage, getPackageByName, listPackages } from "@/lib/db";
import { isValidPackageName } from "@/lib/registry";

export const prerender = false;

interface CreatePackageBody {
  name?: unknown;
  ecosystem?: unknown;
}

export async function GET(): Promise<Response> {
  return Response.json(await listPackages(env.DB));
}

export async function POST(context: APIContext): Promise<Response> {
  let body: CreatePackageBody;
  try {
    body = (await context.request.json()) as CreatePackageBody;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const ecosystem = body.ecosystem === "cargo" ? "cargo" : "npm";
  const valid =
    ecosystem === "cargo"
      ? isValidCargoPackageName(name)
      : isValidPackageName(name);
  if (!valid) {
    return Response.json(
      {
        error:
          ecosystem === "cargo"
            ? "Cargo crate names must be lowercase, like my-crate"
            : "npm package names must be scoped and lowercase, like @myscope/my-package",
      },
      { status: 400 },
    );
  }
  if (await getPackageByName(env.DB, name, ecosystem)) {
    return Response.json({ error: `${name} already exists` }, { status: 409 });
  }
  const pkg = await createPackage(env.DB, name, ecosystem);
  return Response.json(pkg, { status: 201 });
}
