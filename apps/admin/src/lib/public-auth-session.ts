type PublicAuthSession = { user?: { id: string } } | null;

/** A throttled session read is not evidence that the visitor signed out. */
export async function readPublicAuthSession(signal: AbortSignal): Promise<PublicAuthSession> {
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch("/api/auth/get-session", { credentials: "include", signal });
    if (response.ok) return await response.json() as PublicAuthSession;
    if (response.status !== 429 || attempt >= 2) throw new Error("Unable to read authentication session.");
    const retryAfter = Number(response.headers.get("retry-after") ?? response.headers.get("x-retry-after") ?? "60");
    if (!Number.isFinite(retryAfter) || retryAfter < 0 || retryAfter > 60) throw new Error("Unexpected authentication retry period.");
    const milliseconds = retryAfter * 1000 + 100;
    await new Promise<void>((resolve, reject) => {
      if (signal.aborted) { reject(signal.reason); return; }
      const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
      const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, milliseconds);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
}
