/**
 * Fetches JSON from the dashboard's API. A failed response throws an Error
 * with the API's message, its `code`, and the whole body as `payload` for
 * answers that carry more, such as the contact a duplicate phone belongs to.
 */
export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string; code?: string } & Record<string, unknown> | null;
    throw Object.assign(new Error(payload?.error ?? "Request failed."), payload?.code ? { code: payload.code } : {}, payload ? { payload } : {});
  }

  return await response.json() as T;
}
