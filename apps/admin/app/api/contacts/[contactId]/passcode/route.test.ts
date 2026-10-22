import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ set: vi.fn(), remove: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ setContactPasscode: fixture.set, removeContactPasscode: fixture.remove }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { DELETE, PUT } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fakeOperator.userId = "user_1";
  fakeOperator.businessId = "business_1";
});

const params = { params: Promise.resolve({ contactId: "contact_1" }) };
const put = (body: unknown) => PUT(new Request("http://localhost:3000/api/contacts/contact_1/passcode?businessId=business_1", { method: "PUT", body: JSON.stringify(body) }), params);

describe("contact passcode API", () => {
  it("sets the PIN as the signed-in operator and answers without it", async () => {
    fixture.set.mockResolvedValue({ setAt: "2026-10-13T12:00:00.000Z", locked: false });
    const response = await put({ passcode: "480613", userId: "owner", businessId: "business_2" });
    expect(response.status).toBe(200);
    expect(fixture.set).toHaveBeenCalledWith({ db: "app" }, { userId: "user_1", businessId: "business_1", contactId: "contact_1", passcode: "480613" });
    const body = await response.json();
    expect(body).toEqual({ contactId: "contact_1", passcode: { setAt: "2026-10-13T12:00:00.000Z", locked: false } });
    expect(JSON.stringify(body)).not.toContain("480613");
  });

  it.each([[{ passcode: "12a4" }], [{ passcode: "123" }], [{ passcode: "123456789" }], [{ passcode: 4806 }], [{}]])("refuses a PIN that isn't 4 to 8 digits: %j", async (body) => {
    const response = await put(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "invalid_passcode" });
    expect(fixture.set).not.toHaveBeenCalled();
  });

  it.each(["0000", "1234", "98765", "77777777"])("refuses the guessable PIN %s", async (passcode) => {
    const response = await put({ passcode });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "guessable_passcode" });
    expect(fixture.set).not.toHaveBeenCalled();
  });

  it("answers 404 for a contact the business doesn't have", async () => {
    fixture.set.mockResolvedValue(null);
    expect((await put({ passcode: "480613" })).status).toBe(404);
    fixture.remove.mockResolvedValue(false);
    expect((await DELETE(new Request("http://localhost:3000/api/contacts/contact_1/passcode?businessId=business_1", { method: "DELETE" }), params)).status).toBe(404);
  });

  it("removes the PIN as the signed-in operator", async () => {
    fixture.remove.mockResolvedValue(true);
    const response = await DELETE(new Request("http://localhost:3000/api/contacts/contact_1/passcode?businessId=business_1", { method: "DELETE" }), params);
    expect(response.status).toBe(200);
    expect(fixture.remove).toHaveBeenCalledWith({ db: "app" }, { userId: "user_1", businessId: "business_1", contactId: "contact_1" });
    expect(await response.json()).toEqual({ contactId: "contact_1", passcode: null });
  });

  it("passes on the domain's refusal for an operator who isn't an admin", async () => {
    fixture.set.mockRejectedValue(Object.assign(new Error("Forbidden."), { status: 403, code: "forbidden" }));
    const response = await put({ passcode: "480613" });
    expect(response.status).toBe(403);
  });
});
