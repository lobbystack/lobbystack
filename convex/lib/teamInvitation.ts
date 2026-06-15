import type { ActionCtx } from "../_generated/server";

import { sendTransactionalEmail } from "./providers/email";

export const TEAM_INVITATION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const TEAM_INVITATION_TOKEN_LENGTH = 32;
const TEAM_INVITATION_ACCEPT_PATH = "/accept-invite";

export const INVITABLE_TEAM_ROLES = new Set(["viewer", "business_admin"]);

export function assertInvitableTeamRole(role: string): void {
  if (!INVITABLE_TEAM_ROLES.has(role)) {
    throw new Error("Invalid invitation role.");
  }
}

export function generateTeamInvitationToken(
  length: number = TEAM_INVITATION_TOKEN_LENGTH,
): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

export async function hashTeamInvitationToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function buildTeamInvitationAcceptUrl(token: string): string {
  const siteUrl = process.env.SITE_URL;
  if (!siteUrl) {
    throw new Error("SITE_URL is required to build team invitation links.");
  }

  const url = new URL(TEAM_INVITATION_ACCEPT_PATH, siteUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function sendTeamInvitationEmail(
  ctx: Pick<ActionCtx, "runMutation">,
  input: {
    email: string;
    businessName: string;
    inviterName: string;
    role: string;
    token: string;
  },
): Promise<void> {
  const roleLabel = input.role === "business_admin" ? "Admin" : "Viewer";
  await sendTransactionalEmail(ctx, {
    template: "team_invitation",
    to: input.email,
    subject: `Join ${input.businessName} on LobbyStack`,
    variables: {
      acceptUrl: buildTeamInvitationAcceptUrl(input.token),
      businessName: input.businessName,
      inviterName: input.inviterName,
      roleLabel,
      expiresDays: String(TEAM_INVITATION_MAX_AGE_SECONDS / (60 * 60 * 24)),
    },
  });
}
