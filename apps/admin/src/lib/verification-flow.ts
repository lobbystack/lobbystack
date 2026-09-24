import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const cookieName = "lobbystack.verification-flow";
const lifetimeSeconds = 600;

function secret(): string {
  const value = process.env.BETTER_AUTH_SECRET ?? process.env.SESSION_ENCRYPTION_KEY;
  if (value) return value;
  if (process.env.NODE_ENV !== "production") return "development-only-change-me";
  throw new Error("Verification flow requires an authentication secret.");
}

function emailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(`verification-flow:${payload}`).digest("base64url");
}

export function attachVerificationFlow(response: Response, email: string): void {
  const payload = Buffer.from(JSON.stringify({ email: emailHash(email), expires: Date.now() + lifetimeSeconds * 1000 })).toString("base64url");
  const secure = (process.env.APP_BASE_URL ?? "").startsWith("https:") || process.env.NODE_ENV === "production";
  response.headers.append("Set-Cookie", `${cookieName}=${payload}.${sign(payload)}; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=${lifetimeSeconds}${secure ? "; Secure" : ""}`);
  response.headers.set("Cache-Control", "private, no-store");
}

export function hasVerificationFlow(request: Request, email: string): boolean {
  // Cookie proof is usable only by a same-origin browser request.
  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(process.env.APP_BASE_URL ?? request.url).origin;
  if (origin !== expectedOrigin) return false;
  const value = request.headers.get("cookie")?.split(";").map(part => part.trim()).find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (!value) return false;
  try {
    const [payload, signature, extra] = value.split(".");
    if (!payload || !signature || extra) return false;
    const expected = Buffer.from(sign(payload));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.email === emailHash(email) && typeof data.expires === "number" && data.expires > Date.now();
  } catch {
    return false;
  }
}
