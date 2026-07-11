// Client-side helpers shared by the Vue islands.

export interface TokenView {
  id: number;
  label: string;
  token_prefix: string;
  can_read: number;
  can_write: number;
  created_at: string;
  last_used_at: string | null;
  packages: string[];
}

export interface PackageOption {
  id: number;
  name: string;
}

export class ApiError extends Error {}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(path, { ...init, headers });
  if (response.status === 401) {
    window.location.href = "/login";
    throw new ApiError("unauthorized");
  }
  let data: { error?: string } = {};
  try {
    data = (await response.json()) as { error?: string };
  } catch {
    // Non-JSON response bodies fall through to the generic error below.
  }
  if (!response.ok) {
    throw new ApiError(
      data.error ?? `request failed with status ${response.status}`,
    );
  }
  return data as T;
}

export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}
