import type { APIContext } from "astro";
import {
  constantTimeEqual,
  createSession,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { getRuntimeConfig } from "@/lib/config";

export const prerender = false;

export async function POST(context: APIContext): Promise<Response> {
  const config = getRuntimeConfig(context.locals.runtime.env);
  if (!config.adminPassword) {
    return new Response(
      "ADMIN_PASSWORD is not configured. Set it with: npx wrangler secret put ADMIN_PASSWORD",
      { status: 500 },
    );
  }
  const form = await context.request.formData();
  const password = form.get("password");
  if (
    typeof password !== "string" ||
    !(await constantTimeEqual(password, config.adminPassword))
  ) {
    return context.redirect("/login?error=1", 303);
  }
  const session = await createSession(config.adminPassword);
  context.cookies.set(SESSION_COOKIE_NAME, session.value, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: context.url.protocol === "https:",
    expires: session.expires,
  });
  return context.redirect("/", 303);
}
