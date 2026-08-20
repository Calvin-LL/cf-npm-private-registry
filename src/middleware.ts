import type { APIContext, MiddlewareNext } from "astro";
import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { getRuntimeConfig } from "@/lib/config";

// The admin UI lives in a fixed namespace; every other path belongs to the
// npm and Cargo registry protocols, which do their own token authentication.
// npm package names are scoped, and Cargo routes live below /cargo, so neither
// protocol can collide with these prefixes.
const UI_PATH_PATTERN = /^\/(?:$|login$|tokens$|packages(?:\/|$)|api(?:\/|$))/;

async function handleUiRequest(
  context: APIContext,
  next: MiddlewareNext,
): Promise<Response> {
  const pathname = context.url.pathname;

  // CSRF protection for the UI namespace (Astro's global checkOrigin is
  // disabled because it breaks npm clients). Browsers attach an Origin
  // header to every non-GET request; reject it when it is cross-site.
  const method = context.request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    const origin = context.request.headers.get("origin");
    if (origin && origin !== context.url.origin) {
      return new Response("Cross-site requests are forbidden", { status: 403 });
    }
  }

  if (pathname === "/api/login") return next();

  const config = getRuntimeConfig(env);
  const cookie = context.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authed = await verifySession(config.adminPassword, cookie);

  if (pathname === "/login") {
    if (authed) return context.redirect("/", 303);
    return next();
  }
  if (!authed) {
    if (pathname.startsWith("/api/")) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    return context.redirect("/login", 303);
  }
  return next();
}

export const onRequest = defineMiddleware(
  async function onRequest(context, next) {
    if (!UI_PATH_PATTERN.test(context.url.pathname)) return next();
    const response = await handleUiRequest(context, next);
    // The UI shows private package data; keep it out of shared caches and
    // browser caches alike. Registry responses set this themselves.
    response.headers.set("cache-control", "no-store");
    return response;
  },
);
