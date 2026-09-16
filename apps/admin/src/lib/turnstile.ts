const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileResponse = {
  success?: boolean;
  "error-codes"?: string[];
};

function isLocalApp(): boolean {
  const baseUrl = process.env.APP_BASE_URL?.trim();
  return Boolean(baseUrl?.startsWith("http://localhost:") || baseUrl?.startsWith("http://127.0.0.1:"));
}

export async function verifyTurnstileForSignUp(input: { token?: unknown; remoteIp?: string | null }): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (isLocalApp()) return;
    throw new Error("Turnstile is not configured.");
  }
  const token = typeof input.token === "string" && input.token.trim() ? input.token.trim() : undefined;
  if (!token) {
    throw new Error("Turnstile verification is required.");
  }
  const body = new URLSearchParams({ secret, response: token });
  if (input.remoteIp) body.set("remoteip", input.remoteIp);
  let response: Response;
  try {
    response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    throw new Error("Turnstile verification failed.");
  }
  if (!response.ok) {
    throw new Error("Turnstile verification failed.");
  }
  const outcome = (await response.json()) as TurnstileResponse;
  if (outcome.success !== true) {
    throw new Error("Turnstile verification failed.");
  }
}
