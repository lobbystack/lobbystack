import type { Value } from "convex/values";

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileSiteverifyResponse = {
  success?: boolean;
  "error-codes"?: Array<string>;
};

function getStringParam(
  params: Partial<Record<string, Value | undefined>>,
  key: string,
): string | null {
  const value = params[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export async function verifyTurnstileForSignUp(
  params: Partial<Record<string, Value | undefined>>,
): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (process.env.DEPLOYMENT_MODE === "development" && process.env.NODE_ENV !== "production") {
      return;
    }

    throw new Error("Turnstile is not configured.");
  }

  const token =
    getStringParam(params, "cf-turnstile-response") ??
    getStringParam(params, "turnstileToken");
  if (!token) {
    throw new Error("Turnstile verification required.");
  }

  const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      secret,
      response: token,
    }),
  });

  if (!response.ok) {
    throw new Error("Turnstile verification failed.");
  }

  const outcome = (await response.json()) as TurnstileSiteverifyResponse;
  if (outcome.success !== true) {
    throw new Error("Turnstile verification failed.");
  }
}
