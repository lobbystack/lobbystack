import { getTableColumns } from "drizzle-orm";
import { passkey } from "@better-auth/passkey";
import { passkeys } from "@lobbystack/db";
import { describe, expect, it } from "vitest";

import { isPasskeyPath, passkeyAllowed, passkeyRpId } from "./passkey";

describe("passkeyRpId", () => {
  it("is the hostname of APP_BASE_URL", () => {
    expect(passkeyRpId({ APP_BASE_URL: "https://app.lobbystack.com/some/path" })).toBe("app.lobbystack.com");
  });

  it("lets PASSKEY_RP_ID name it, for a tunnel or a parent domain", () => {
    expect(passkeyRpId({ APP_BASE_URL: "https://b584.ngrok-free.app", PASSKEY_RP_ID: " lobbystack.com " })).toBe("lobbystack.com");
  });

  it("falls back to localhost without a usable base URL", () => {
    expect(passkeyRpId({})).toBe("localhost");
    expect(passkeyRpId({ APP_BASE_URL: "not a url" })).toBe("localhost");
  });
});

describe("isPasskeyPath", () => {
  it("matches the plugin's routes only", () => {
    expect(isPasskeyPath("/passkey/verify-authentication")).toBe(true);
    expect(isPasskeyPath("/passkey/list-user-passkeys")).toBe(true);
    expect(isPasskeyPath("/sign-in/email")).toBe(false);
    expect(isPasskeyPath("/passkeys")).toBe(false);
    expect(isPasskeyPath(undefined)).toBe(false);
  });
});

describe("passkeyAllowed", () => {
  it("is for the host's own domain only", () => {
    expect(passkeyAllowed(new Headers({ "x-lobbystack-brand": "host" }))).toBe(true);
    expect(passkeyAllowed(new Headers({ "x-lobbystack-brand": "partner:7b0c5a43-62c4-4a51-9d0e-6f6f0e0d9a11", "x-lobbystack-brand-origin": "https://acme.partners.example" }))).toBe(false);
    expect(passkeyAllowed(new Headers())).toBe(false);
  });
});

describe("the passkeys table", () => {
  // Better Auth finds columns by its own field names, so a renamed property would break sign-in silently.
  it("has every field the plugin stores, under the plugin's names", () => {
    const fields = Object.keys(passkey().schema.passkey.fields);
    const columns = Object.keys(getTableColumns(passkeys));
    for (const field of fields) expect(columns).toContain(field);
  });
});
