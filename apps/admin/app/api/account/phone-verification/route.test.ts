import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireOperatorBusiness: vi.fn(),
  startOperatorPhoneVerification: vi.fn(),
  getOperatorPhoneVerification: vi.fn(),
  checkOperatorPhoneVerificationCode: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  requireOperatorBusiness: mocks.requireOperatorBusiness,
  readJson: async (request: Request) => await request.json(),
  jsonError: (error: string, status = 400, code?: string) => Response.json({ error, ...(code ? { code } : {}) }, { status }),
  asApiResponse: (error: { status?: number; code?: string; message?: string }) => Response.json({ error: error.status && error.status < 500 ? error.message : "Request failed.", ...(error.code ? { code: error.code } : {}) }, { status: error.status ?? 500 }),
}));
vi.mock("@/lib/domain-context", () => ({ createDomainContext: () => ({ db: "app-db" }) }));
vi.mock("@lobbystack/domain", () => ({
  startOperatorPhoneVerification: mocks.startOperatorPhoneVerification,
  getOperatorPhoneVerification: mocks.getOperatorPhoneVerification,
  checkOperatorPhoneVerificationCode: mocks.checkOperatorPhoneVerificationCode,
}));

import { GET, POST } from "./route";
import { POST as CHECK } from "./check/route";

const url = "https://app.example.test/api/account/phone-verification?businessId=business-1";
function post(target: string, body: unknown) {
  return new Request(target, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

beforeEach(() => {
  mocks.requireOperatorBusiness.mockResolvedValue({ session: { user: { id: "user-1" } }, businessId: "business-1" });
});
afterEach(() => { vi.resetAllMocks(); });

describe("start phone verification", () => {
  it("normalizes the number to E.164 and starts verification for the signed-in user", async () => {
    mocks.startOperatorPhoneVerification.mockResolvedValue({ attemptId: "attempt-1" });
    const response = await POST(post(url, { phoneNumber: "+1 (416) 555-0123" }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ attemptId: "attempt-1", phoneE164: "+14165550123" });
    expect(mocks.startOperatorPhoneVerification).toHaveBeenCalledWith({ db: "app-db" }, { userId: "user-1", businessId: "business-1", phoneE164: "+14165550123", countryCode: "CA", locale: "en" });
  });

  it("passes the operator's language on for the code text", async () => {
    mocks.startOperatorPhoneVerification.mockResolvedValue({ attemptId: "attempt-1" });
    await POST(post(url, { phoneNumber: "+14165550123", locale: "fr" }));
    expect(mocks.startOperatorPhoneVerification).toHaveBeenCalledWith({ db: "app-db" }, expect.objectContaining({ locale: "fr" }));
  });

  it.each([["not a phone"], [""], [12345]])("rejects %j before reaching the domain", async (phoneNumber) => {
    const response = await POST(post(url, { phoneNumber }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ code: "phone_number_invalid" });
    expect(mocks.startOperatorPhoneVerification).not.toHaveBeenCalled();
  });

  it("passes on a clear error when the alert sender can't text the number", async () => {
    mocks.startOperatorPhoneVerification.mockRejectedValue(Object.assign(new Error("The alert SMS sender can't text this number."), { status: 422, code: "phone_unreachable" }));
    const response = await POST(post(url, { phoneNumber: "+447911123456" }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "The alert SMS sender can't text this number.", code: "phone_unreachable" });
  });

  it("requires a session", async () => {
    mocks.requireOperatorBusiness.mockRejectedValue(Object.assign(new Error("Authentication required."), { status: 401, code: "unauthorized" }));
    const response = await POST(post(url, { phoneNumber: "+14165550123" }));
    expect(response.status).toBe(401);
    expect(mocks.startOperatorPhoneVerification).not.toHaveBeenCalled();
  });
});

describe("phone verification status", () => {
  it("returns the attempt status without the phone or code", async () => {
    mocks.getOperatorPhoneVerification.mockResolvedValue({ id: "attempt-1", status: "sent", expiresAt: new Date("2026-10-03T12:10:00.000Z") });
    const response = await GET(new Request(`${url}&attemptId=attempt-1`));
    expect(await response.json()).toEqual({ attempt: { id: "attempt-1", status: "sent", expiresAt: "2026-10-03T12:10:00.000Z" } });
    expect(mocks.getOperatorPhoneVerification).toHaveBeenCalledWith({ db: "app-db" }, { userId: "user-1", businessId: "business-1", attemptId: "attempt-1" });
  });

  it("returns 404 for an attempt the user doesn't own", async () => {
    mocks.getOperatorPhoneVerification.mockResolvedValue(null);
    expect((await GET(new Request(`${url}&attemptId=other`))).status).toBe(404);
  });
});

describe("check phone verification code", () => {
  const checkUrl = "https://app.example.test/api/account/phone-verification/check?businessId=business-1";

  it("checks the code for the signed-in user", async () => {
    mocks.checkOperatorPhoneVerificationCode.mockResolvedValue({ approved: true, status: "approved" });
    const response = await CHECK(post(checkUrl, { attemptId: "attempt-1", code: "123456" }));
    expect(await response.json()).toEqual({ approved: true, status: "approved" });
    expect(mocks.checkOperatorPhoneVerificationCode).toHaveBeenCalledWith({ db: "app-db" }, { userId: "user-1", businessId: "business-1", attemptId: "attempt-1", code: "123456" });
  });

  it("reports a wrong code with the checks left", async () => {
    mocks.checkOperatorPhoneVerificationCode.mockResolvedValue({ approved: false, status: "invalid", remainingAttempts: 3 });
    const response = await CHECK(post(checkUrl, { attemptId: "attempt-1", code: "000000" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ approved: false, status: "invalid", remainingAttempts: 3 });
  });

  it("requires an attempt and a code", async () => {
    const response = await CHECK(post(checkUrl, { code: "123456" }));
    expect(response.status).toBe(400);
    expect(mocks.checkOperatorPhoneVerificationCode).not.toHaveBeenCalled();
  });
});
