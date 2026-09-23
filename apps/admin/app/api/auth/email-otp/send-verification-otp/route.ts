import { z } from "zod";

import { EmailVerificationRateLimitError } from "@/lib/email-verification-policy";
import { issueEmailVerificationCode } from "@/lib/auth";
import { trustedClientIp } from "@/lib/trusted-client-ip";
import { verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";

const requestSchema = z.object({
  email: z.string().email(),
  type: z.literal("email-verification"),
  turnstileToken: z.string().trim().min(1).optional(),
});

const successResponse = () => Response.json({ success: true });

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ code: "INVALID_REQUEST", message: "Invalid request." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ code: "INVALID_REQUEST", message: "Invalid request." }, { status: 400 });

  const email = parsed.data.email.trim().toLowerCase();
  // Shared trusted-IP derivation: only an explicitly configured, ingress-
  // controlled header is trusted, and an unset opt-in yields no remote IP.
  const remoteIp = trustedClientIp(request);
  try {
    await verifyTurnstile({ token: parsed.data.turnstileToken, ...(remoteIp ? { remoteIp } : {}) });
  } catch {
    return Response.json({ code: "CHALLENGE_FAILED", message: "Verification challenge failed." }, { status: 400 });
  }

  try {
    await issueEmailVerificationCode(email, remoteIp);
    return successResponse();
  } catch (error) {
    if (error instanceof EmailVerificationRateLimitError) {
      return Response.json(
        { code: "RATE_LIMITED", message: "Please wait before requesting another verification code." },
        { status: 429, headers: { "retry-after": "60" } },
      );
    }
    return Response.json({ code: "SERVICE_UNAVAILABLE", message: "Verification service unavailable." }, { status: 503 });
  }
}
