const encoder = new TextEncoder();
const SESSION_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export const SESSION_COOKIE_NAME = "session";
export const TOKEN_PREFIX_LENGTH = 14;

function toHex(bytes: Uint8Array): string {
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(input));
  return toHex(new Uint8Array(digest));
}

// Compares two strings in constant time using Cloudflare's built-in
// crypto.subtle.timingSafeEqual. Both inputs are hashed first so the
// comparison never leaks length information either.
export async function constantTimeEqual(
  a: string,
  b: string,
): Promise<boolean> {
  const [digestA, digestB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(digestA, digestB);
}

export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `cfnpm_${toHex(bytes)}`;
}

async function sessionHmacKey(adminPassword: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`cf-npm-private-registry:${adminPassword}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function signSessionExpiry(
  adminPassword: string,
  expiresAtMs: number,
): Promise<string> {
  const key = await sessionHmacKey(adminPassword);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`session:${expiresAtMs}`),
  );
  return toHex(new Uint8Array(signature));
}

export interface Session {
  value: string;
  expires: Date;
}

export async function createSession(adminPassword: string): Promise<Session> {
  const expiresAtMs = Date.now() + SESSION_COOKIE_MAX_AGE_MS;
  const signature = await signSessionExpiry(adminPassword, expiresAtMs);
  return {
    value: `${expiresAtMs}.${signature}`,
    expires: new Date(expiresAtMs),
  };
}

export async function verifySession(
  adminPassword: string | undefined,
  cookieValue: string | undefined,
): Promise<boolean> {
  if (!adminPassword || !cookieValue) return false;
  const separator = cookieValue.indexOf(".");
  if (separator < 0) return false;
  const expiresAtMs = Number(cookieValue.slice(0, separator));
  if (!Number.isFinite(expiresAtMs) || expiresAtMs < Date.now()) return false;
  const expected = await signSessionExpiry(adminPassword, expiresAtMs);
  return constantTimeEqual(cookieValue.slice(separator + 1), expected);
}
