import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ resolve: vi.fn(), list: vi.fn(), create: vi.fn(), rename: vi.fn(), archive: vi.fn(), stripe: { name: "stripe connect" } as unknown }));
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ resolvePartnerActor: fixture.resolve, listPartnerPackages: fixture.list, createPartnerPackage: fixture.create, renamePartnerPackage: fixture.rename, archivePartnerPackage: fixture.archive }));
vi.mock("@/lib/stripe-connect", () => ({ withStripeConnect: (context: object) => ({ ...context, stripeConnect: fixture.stripe }) }));

import { resetFakeOperator } from "@/lib/operator-request.fake";
import { DELETE, GET, PATCH, POST } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const packageId = "8f0b2c1d-4e5a-4b6c-9d7e-1f2a3b4c5d6e";
const actor = { kind: "member", partnerId, userId: "user", role: "admin" };
const frontDesk = { packageId, name: "Front desk", currency: "CAD", monthlyPriceMinor: 14900, setupFeeMinor: null, allowance: { voiceMinutes: 300, chats: 1000 }, onConnectedAccount: true, createdAt: "2026-10-26T00:00:00.000Z" };
const send = (method: string, body: unknown) => new Request("http://localhost:3000/api/partner/packages", { method, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  fixture.resolve.mockResolvedValue(actor);
  fixture.list.mockResolvedValue({ role: "admin", stripe: { configured: true, status: "active", currency: "CAD" }, packages: [frontDesk] });
  fixture.create.mockResolvedValue(frontDesk);
  fixture.rename.mockResolvedValue({ ...frontDesk, name: "Front desk plus" });
});

it("lists the partner's packages, reaching Stripe Connect", async () => {
  expect(await (await GET(new Request(`http://localhost:3000/api/partner/packages?partnerId=${partnerId}`))).json()).toMatchObject({ packages: [frontDesk] });
  expect(fixture.list).toHaveBeenCalledWith(expect.objectContaining({ stripeConnect: fixture.stripe }), actor);
});

it("hands the package's terms to the partner operation, which checks them", async () => {
  const response = await POST(send("POST", { partnerId, name: "Front desk", monthlyPriceMinor: 14900, setupFeeMinor: null, voiceMinutes: 300, chats: 1000, extra: "ignored" }));
  expect(response.status).toBe(201);
  expect(fixture.create).toHaveBeenCalledWith(expect.objectContaining({ stripeConnect: fixture.stripe }), actor, { name: "Front desk", monthlyPriceMinor: 14900, setupFeeMinor: null, voiceMinutes: 300, chats: 1000 });

  fixture.create.mockRejectedValueOnce(Object.assign(new Error("Connect your Stripe account before you sell packages."), { status: 409, code: "stripe_not_connected" }));
  const refused = await POST(send("POST", { partnerId, name: "Front desk", monthlyPriceMinor: 14900 }));
  expect(refused.status).toBe(409);
  expect(await refused.json()).toMatchObject({ code: "stripe_not_connected" });
});

it("renames and archives a package it names by id", async () => {
  expect(await (await PATCH(send("PATCH", { partnerId, packageId, name: "Front desk plus" }))).json()).toMatchObject({ name: "Front desk plus" });
  expect(fixture.rename).toHaveBeenCalledWith(expect.anything(), actor, { packageId, name: "Front desk plus" });
  expect(await (await DELETE(send("DELETE", { partnerId, packageId }))).json()).toEqual({ ok: true });
  expect(fixture.archive).toHaveBeenCalledWith(expect.anything(), actor, { packageId });

  expect((await PATCH(send("PATCH", { partnerId, packageId: "front-desk", name: "x" }))).status).toBe(400);
  expect((await DELETE(send("DELETE", { partnerId }))).status).toBe(400);
  expect(fixture.rename).toHaveBeenCalledTimes(1);
  expect(fixture.archive).toHaveBeenCalledTimes(1);
});
