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

  it("sends only a carrier failure's fixed message to the browser, and reports the carrier's own words", async () => {
    const carrierWords = new Error("Zadarma /v1/direct_numbers/order/ answered 400: You do not have sufficient funds on your account.");
    const error = Object.assign(new Error("We can't set up a number right now. Please try again later.", { cause: carrierWords }), { status: 503, code: "number_carrier_unavailable" });
    const response = asApiResponse(error);

    expect(response.status).toBe(503);
    const body = await response.json() as { error: string; code: string; errorId: string };
    expect(body).toMatchObject({ error: "We can't set up a number right now. Please try again later.", code: "number_carrier_unavailable" });
    expect(JSON.stringify(body)).not.toMatch(/zadarma|funds|direct_numbers/i);
    expect(mocks.reportServerError).toHaveBeenCalledWith(error, expect.objectContaining({ errorId: body.errorId }));
  });
});
