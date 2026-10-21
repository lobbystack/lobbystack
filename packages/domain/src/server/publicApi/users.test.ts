import { expect, it } from "vitest";

import { invitedUserEmail, inviteUserForApi } from "./users";

it("reads the address as accounts store it, and refuses a list of addresses before touching the database", async () => {
  expect(invitedUserEmail({ email: " Owner@Example.COM " })).toBe("owner@example.com");
  const key = { kind: "platform_key", platformKeyId: "key-1" } as never;
  await expect(inviteUserForApi({ auth: {} as never, app: {} as never }, { key, idempotencyKey: "x", body: { email: "a@example.com, b@example.com" }, appBaseUrl: "https://app.example.com" })).rejects.toMatchObject({ status: 400, code: "invalid_request" });
});
