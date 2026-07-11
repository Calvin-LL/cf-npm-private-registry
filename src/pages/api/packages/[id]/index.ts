import type { APIContext } from "astro";
import { deletePackage, getPackageById, listVersions } from "@/lib/db";

export const prerender = false;

export async function DELETE(context: APIContext): Promise<Response> {
  const env = context.locals.runtime.env;
  const id = Number(context.params.id);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "invalid package id" }, { status: 400 });
  }
  const pkg = await getPackageById(env.DB, id);
  if (!pkg) {
    return Response.json({ error: "package not found" }, { status: 404 });
  }
  const versions = await listVersions(env.DB, id);
  if (versions.length > 0) {
    await env.TARBALLS.delete(
      versions.map(function toKey(row) {
        return row.tarball_key;
      }),
    );
  }
  await deletePackage(env.DB, id);
  return Response.json({ ok: true });
}
