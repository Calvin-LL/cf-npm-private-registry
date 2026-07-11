export interface RuntimeConfig {
  adminPassword: string | undefined;
  proxyUpstream: boolean;
  upstreamRegistry: string;
}

// Vars are typed as string literals by `wrangler types` and secrets may not be
// typed at all, so read them through an untyped view of the environment.
export function getRuntimeConfig(env: Env): RuntimeConfig {
  const raw = env as unknown as Record<string, unknown>;
  const adminPassword =
    typeof raw.ADMIN_PASSWORD === "string" && raw.ADMIN_PASSWORD.length > 0
      ? raw.ADMIN_PASSWORD
      : undefined;
  const proxyUpstream = raw.PROXY_UPSTREAM === "true";
  const upstreamRegistry =
    typeof raw.UPSTREAM_REGISTRY === "string" &&
    raw.UPSTREAM_REGISTRY.length > 0
      ? raw.UPSTREAM_REGISTRY.replace(/\/+$/, "")
      : "https://registry.npmjs.org";
  return { adminPassword, proxyUpstream, upstreamRegistry };
}
