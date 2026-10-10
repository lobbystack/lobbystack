import { describe, expect, it } from "vitest";

import { createService, updateService } from "./catalog";

// The fields are checked before any database work, so no database is needed.
const context = { db: {} as never };
const valid = { userId: "user_1", businessId: "biz_1", name: "Drain cleaning", slug: "drain-cleaning", durationMinutes: 30 };

describe("service fields", () => {
  it.each([
    [{ durationMinutes: 1_441 }, "durationMinutes"],
    [{ durationMinutes: 0 }, "durationMinutes"],
    [{ durationMinutes: 1.5 }, "durationMinutes"],
    [{ name: " " }, "name"],
    [{ name: "x".repeat(161) }, "name"],
    [{ slug: "" }, "slug"],
    [{ description: "" }, "description"],
    [{ active: "yes" }, "active"],
  ])("refuses %o the same way on create and on update", async (fields, field) => {
    const refusal = { status: 400, message: `${field} is invalid.` };
    await expect(createService(context, { ...valid, ...fields } as never)).rejects.toMatchObject(refusal);
    await expect(updateService(context, { userId: valid.userId, businessId: valid.businessId, serviceId: "svc_1", ...fields } as never)).rejects.toMatchObject(refusal);
  });
});
