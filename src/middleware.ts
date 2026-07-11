import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import { getRuntimeConfig } from "@/lib/config";

// The admin UI lives in a fixed namespace; every other path belongs to the
// npm registry protocol, which does its own token authentication. Package
// names are required to be scoped (start with "@"), so they can never
// collide with these prefixes.
const UI_PATH_PATTERN = /^\/(?:$|login$|tokens$|packages(?:\/|$)|api(?:\/|$))/;

export const onRequest = defineMiddleware(
  async function onRequest(context, next) {
    const pathname = context.url.pathname;
    if (!UI_PATH_PATTERN.test(pathname)) return next();

    // CSRF protection for the UI namespace (Astro's global checkOrigin is
    // disabled because it breaks npm clients). Browsers attach an Origin
    // header to every non-GET request; reject it when it is cross-site.
    const method = context.request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      const origin = context.request.headers.get("origin");
      if (origin && origin !== context.url.origin) {
        return new Response("Cross-site requests are forbidden", {
          status: 403,
        });
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
  },
);
