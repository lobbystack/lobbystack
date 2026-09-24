import { expect, it } from "vitest";
import { createBusiness } from "./tenancy";

it.each(["", " ", "!!!", "a", "a".repeat(121)])("rejects invalid normalized explicit slug %j as a client error", async slug => {
  await expect(createBusiness({ db: undefined as never }, { userId: "unused", name: "Test", slug, timezone: "UTC", businessType: "test" })).rejects.toMatchObject({ status: 400 });
});
