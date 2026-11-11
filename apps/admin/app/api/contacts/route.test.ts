import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => {
  class ContactPhoneTakenError extends Error {
    readonly status = 409;
    readonly code = "contact_exists";
    constructor(readonly contactId: string | null) { super("taken"); }
  }
  return { create: vi.fn(), list: vi.fn(), ContactPhoneTakenError };
});
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ createContact: fixture.create, listContacts: fixture.list, ContactPhoneTakenError: fixture.ContactPhoneTakenError }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { POST } from "./route";

const create = (body: Record<string, unknown>) => POST(new Request("http://localhost:3010/api/contacts?businessId=business_1", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  Object.assign(fakeOperator, { userId: "user_1", businessId: "business_1" });
  fixture.create.mockResolvedValue({ contactId: "contact_1" });
});

describe("operator contact create API", () => {
  it("creates the contact as the signed-in operator", async () => {
    const response = await create({ name: " Ana Petrović ", phone: "+14165550100", email: "ana@example.com" });
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ contactId: "contact_1" });
    expect(fixture.create).toHaveBeenCalledWith({ db: "app" }, { userId: "user_1", businessId: "business_1", name: "Ana Petrović", phone: "+14165550100", email: "ana@example.com" });
  });

  it("takes a name with only an email, and leaves blank fields out", async () => {
    expect((await create({ name: "Ana", phone: "", email: "ana@example.com" })).status).toBe(201);
    expect(fixture.create).toHaveBeenCalledWith({ db: "app" }, { userId: "user_1", businessId: "business_1", name: "Ana", email: "ana@example.com" });
  });

  it("refuses a contact without a name, without a phone or email, or with a malformed phone", async () => {
    expect((await create({ phone: "+14165550100" })).status).toBe(400);
    expect((await create({ name: "Ana" })).status).toBe(400);
    expect((await create({ name: "Ana", phone: "416 555 0100" })).status).toBe(400);
    expect((await create({ name: "Ana", email: "not an email" })).status).toBe(400);
    expect(fixture.create).not.toHaveBeenCalled();
  });

  it("names the existing contact when the phone is taken", async () => {
    fixture.create.mockRejectedValue(new fixture.ContactPhoneTakenError("contact_9"));
    const response = await create({ name: "Ana", phone: "+14165550100" });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "A contact with this phone number already exists.", code: "contact_exists", contactId: "contact_9" });
  });

  it("returns the domain's refusal for roles below admin", async () => {
    fixture.create.mockRejectedValue(Object.assign(new Error("You do not have access to this business."), { status: 403, code: "forbidden" }));
    const response = await create({ name: "Ana", phone: "+14165550100" });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "forbidden" });
  });
});
