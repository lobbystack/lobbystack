import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ update: vi.fn(), list: vi.fn(), create: vi.fn(), switchWorkspace: vi.fn() }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ updateBusiness: fixture.update, listUserBusinesses: fixture.list, createBusiness: fixture.create, switchWorkspace: fixture.switchWorkspace, attributeBusiness: vi.fn(), ianaTimeZone: (zone: string) => zone }));

import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { setBrandHeaders } from "@/lib/request-brand";
import { GET, PATCH, POST } from "./route";
import { POST as SWITCH } from "./switch/route";

const partnerId = "5a0f6c7e-1d2b-4c3a-9e8f-7a6b5c4d3e2f";
const partnerHost = () => setBrandHeaders(new Headers(), { kind: "partner", partnerId, origin: "https://acme.portal.example.test" });
const hostDomain = () => setBrandHeaders(new Headers(), { kind: "host" });

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  Object.assign(fakeOperator, { userId: "user_1", businessId: "business_1" });
});

describe("business settings API", () => {
  it("acts as the signed-in operator even when the body names another user or business", async () => {
    const response = await PATCH(new Request("http://localhost:3000/api/businesses?businessId=business_1", {
      method: "PATCH",
      body: JSON.stringify({ userId: "owner", businessId: "business_2", timezone: "Asia/Tokyo" }),
    }));
    expect(response.status).toBe(200);
    expect(fixture.update).toHaveBeenCalledWith({ db: "app" }, { userId: "user_1", businessId: "business_1", timezone: "Asia/Tokyo" });
  });
});

describe("businesses on each brand's domain", () => {
  it("lists only the request's brand's businesses", async () => {
    fixture.list.mockResolvedValue([]);
    await GET(new Request("https://acme.portal.example.test/api/businesses", { headers: partnerHost() }));
    expect(fixture.list).toHaveBeenLastCalledWith("app", "user_1", { kind: "partner", partnerId });
    await GET(new Request("https://desk.example.test/api/businesses", { headers: hostDomain() }));
    expect(fixture.list).toHaveBeenLastCalledWith("app", "user_1", { kind: "host" });
  });

  it("opens a business on the request's brand only", async () => {
    Object.assign(fakeOperator, { businessId: "business_1" });
    await SWITCH(new Request("https://acme.portal.example.test/api/businesses/switch", { method: "POST", headers: partnerHost(), body: "{}" }));
    expect(fixture.switchWorkspace).toHaveBeenCalledWith({ db: "app" }, { userId: "user_1", businessId: "business_1", brand: { kind: "partner", partnerId } });
  });

  it("creates no direct business on a partner's domain", async () => {
    const body = JSON.stringify({ name: "Corner Shop", timezone: "UTC", businessType: "test" });
    const refused = await POST(new Request("https://acme.portal.example.test/api/businesses", { method: "POST", headers: partnerHost(), body }));
    expect(refused.status).toBe(403);
    await expect(refused.json()).resolves.toMatchObject({ code: "partner_host" });
    expect(fixture.create).not.toHaveBeenCalled();
    fixture.create.mockResolvedValue({ businessId: "business_2", membershipId: "membership" });
    expect((await POST(new Request("https://desk.example.test/api/businesses", { method: "POST", headers: hostDomain(), body }))).status).toBe(201);
    expect(fixture.create).toHaveBeenCalledOnce();
  });
});
