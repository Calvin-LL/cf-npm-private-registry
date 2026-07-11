import type { APIContext } from "astro";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  context.cookies.delete(SESSION_COOKIE_NAME, { path: "/" });
  return context.redirect("/login", 303);
}
