import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ reportServerError: vi.fn() }));

vi.mock("./error-reporting", () => ({
  reportServerError: mocks.reportServerError,
}));

import { asApiResponse } from "./api-helpers";

describe("asApiResponse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns typed validation errors without reporting them as server exceptions", async () => {
    const response = asApiResponse(Object.assign(
      new Error("A mobile phone number is required."),
      { status: 422, code: "phone_number_not_mobile" },
    ));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: "A mobile phone number is required.",
      code: "phone_number_not_mobile",
    });
    expect(mocks.reportServerError).not.toHaveBeenCalled();
  });

  it("keeps the code of a country whose carrier isn't set up, so the number picker can explain it", async () => {
    const response = asApiResponse(Object.assign(new Error("Phone numbers aren't set up on this deployment."), { status: 503, code: "phone_numbers_unavailable" }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Phone numbers aren't set up on this deployment.", code: "phone_numbers_unavailable" });
    expect(mocks.reportServerError).not.toHaveBeenCalled();
  });
});
