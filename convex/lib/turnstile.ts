import type { Value } from "convex/values";

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileSiteverifyResponse = {
  success?: boolean;
  "error-codes"?: Array<string>;
};

function getVerificationFailureMessage(outcome?: TurnstileSiteverifyResponse): string {
  const errorCodes = outcome?.["error-codes"];
  if (!errorCodes || errorCodes.length === 0) {
    return "Turnstile verification failed.";
  }

  return `Turnstile verification failed: ${errorCodes.join(", ")}`;
}

function getStringParam(
  params: Partial<Record<string, Value | undefined>>,
  key: string,
): string | null {
  const value = params[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isLocalConvexSiteUrl(): boolean {
  const siteUrl = process.env.CONVEX_SITE_URL?.trim();
  return Boolean(
    siteUrl?.startsWith("http://127.0.0.1:") ||
      siteUrl?.startsWith("http://localhost:"),
  );
}

export async function verifyTurnstileForSignUp(
  params: Partial<Record<string, Value | undefined>>,
): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (isLocalConvexSiteUrl()) {
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

  const body = new URLSearchParams({
    secret,
    response: token,
  });

  const response = await fetch(TURNSTILE_SITEVERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    throw new Error("Turnstile verification failed.");
  }

  const outcome = (await response.json()) as TurnstileSiteverifyResponse;
  if (outcome.success !== true) {
    throw new Error(getVerificationFailureMessage(outcome));
  }
}
