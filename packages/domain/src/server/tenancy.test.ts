import { expect, it } from "vitest";
import { createBusiness, inviteMember } from "./tenancy";

it.each(["", " ", "!!!", "a", "a".repeat(121)])("rejects invalid normalized explicit slug %j as a client error", async slug => {
  await expect(createBusiness({ db: undefined as never }, { userId: "unused", name: "Test", slug, timezone: "UTC", businessType: "test" })).rejects.toMatchObject({ status: 400 });
});

it.each(["a@x.com, b@y.com", "a@x.com;b@y.com", "Ann <a@x.com>", "g:a@x.com", "a@x", "not-an-email"])("rejects invite email %j that is not exactly one address", async email => {
  await expect(inviteMember({ db: undefined as never }, { userId: "unused", businessId: "unused", email, role: "viewer" })).rejects.toMatchObject({ status: 400 });
});
