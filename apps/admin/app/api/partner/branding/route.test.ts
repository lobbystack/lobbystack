import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => {
  // Next.js' server sets this before any route runs, and its request store is built on it.
  Object.assign(globalThis, { AsyncLocalStorage: process.getBuiltinModule("node:async_hooks").AsyncLocalStorage });
  return { resolve: vi.fn(), read: vi.fn(), save: vi.fn() };
});
vi.mock("@/lib/operator-request", () => import("@/lib/operator-request.fake"));
vi.mock("@lobbystack/domain", () => ({ resolvePartnerActor: fixture.resolve, getPartnerBrandSettings: fixture.read, savePartnerBrand: fixture.save }));

// The real revalidatePath, inside the store Next.js gives a route handler, and the
// tags Next.js puts on each cached page, so the test sees what a save expires.
import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";
import { workAsyncStorage } from "next/dist/server/app-render/work-async-storage.external";
import { getImplicitTags } from "next/dist/server/lib/implicit-tags";
import { resetFakeOperator } from "@/lib/operator-request.fake";
import { SUPPORTED_LOCALES } from "@/lib/locale";
import { PRERENDERED_PUBLIC_SECTIONS } from "@/lib/partner-site";
import { GET, PUT } from "./route";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const actor = { kind: "member", partnerId, userId: "user", role: "admin" };
const settings = { role: "admin", name: "Bright Desk", subdomain: "bright.portal.example.test", subdomainUrl: "https://bright.portal.example.test", logoUrl: null, faviconUrl: null, color: null, termsUrl: null, privacyUrl: null, supportUrl: null, supportEmail: null };
const fields = { name: "Bright Desk", color: "#0f766e", termsUrl: "https://bright.example.test/terms", privacyUrl: null, supportUrl: "", supportEmail: "help@bright.example.test" };
const otherPartnerId = "0d6f9c1e-2b7a-4c55-8f0e-3a9b1d2c4e5f";

let expired: string[] = [];
/** A PUT as Next.js runs it, recording the cache tags it expires. */
async function put(body: unknown, query = `?partnerId=${partnerId}`): Promise<Response> {
  const store = { route: "/api/partner/branding", incrementalCache: {} } as unknown as WorkStore;
  const response = await workAsyncStorage.run(store, () => PUT(new Request(`http://localhost:3000/api/partner/branding${query}`, { method: "PUT", body: typeof body === "string" ? body : JSON.stringify(body) })));
  expired.push(...(store.pendingRevalidatedTags ?? []).map(({ tag }) => tag));
  return response;
}

/** Whether a save expired a partner's cached copy of one public page, which the proxy rewrites to /partner-site/<id>/<locale>/<section>. */
async function expiresPage(id: string, locale: string, section: string): Promise<boolean> {
  const { tags } = await getImplicitTags(`/(partner-site)/partner-site/[partnerId]/[locale]/${section}/page`, `/partner-site/${id}/${locale}/${section}`, null);
  return tags.some((tag) => expired.includes(tag));
}

beforeEach(() => {
  vi.clearAllMocks();
  resetFakeOperator();
  expired = [];
  fixture.resolve.mockResolvedValue(actor);
  fixture.read.mockResolvedValue(settings);
  fixture.save.mockResolvedValue(settings);
});

it("reads the brand as the signed-in person on the partner the request names", async () => {
  const response = await GET(new Request(`http://localhost:3000/api/partner/branding?partnerId=${partnerId}`));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual(settings);
  expect(fixture.resolve).toHaveBeenCalledWith(expect.anything(), { userId: "user", partnerId });
  expect(fixture.read).toHaveBeenCalledWith(expect.anything(), actor);
});

it("acts only on the host's partner on a partner's host, whatever partner the person is also on", async () => {
  // The headers the proxy sets on another partner's host.
  const headers = { "x-lobbystack-brand": `partner:${otherPartnerId}`, "x-lobbystack-brand-origin": "https://other.portal.example.test" };
  const elsewhere = await GET(new Request(`http://localhost:3000/api/partner/branding?partnerId=${partnerId}`, { headers }));
  expect(elsewhere.status).toBe(404);
  expect(await elsewhere.json()).toMatchObject({ code: "partner_not_found" });
  expect(fixture.resolve).not.toHaveBeenCalled();
  expect((await GET(new Request(`http://localhost:3000/api/partner/branding?partnerId=${otherPartnerId.toUpperCase()}`, { headers }))).status).toBe(200);
  expect(fixture.resolve).toHaveBeenCalledWith(expect.anything(), { userId: "user", partnerId: otherPartnerId.toUpperCase() });
});

it("answers someone off the partner's team with 404, and a request naming no partner with 400", async () => {
  fixture.resolve.mockRejectedValueOnce(Object.assign(new Error("Partner not found."), { status: 404, code: "partner_not_found" }));
  expect((await put(fields)).status).toBe(404);
  expect((await put(fields, "")).status).toBe(400);
  expect(fixture.save).not.toHaveBeenCalled();
});

it("saves the text fields, keeps an image left out, removes one sent as null and decodes a new one", async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect((await put(fields)).status).toBe(200);
  expect(fixture.save).toHaveBeenLastCalledWith(expect.anything(), actor, fields);
  await put({ ...fields, logo: png.toString("base64"), favicon: null });
  expect(fixture.save).toHaveBeenLastCalledWith(expect.anything(), actor, { ...fields, logo: png, favicon: null });
});

it("expires the partner's copy of every prerendered public page in every locale, and no other partner's", async () => {
  // A client may name the partner in capitals; the proxy rewrites to the id in lowercase.
  expect((await put(fields, `?partnerId=${partnerId.toUpperCase()}`)).status).toBe(200);
  for (const locale of SUPPORTED_LOCALES) {
    for (const section of PRERENDERED_PUBLIC_SECTIONS) {
      expect(await expiresPage(partnerId, locale, section), `${locale}/${section}`).toBe(true);
      expect(await expiresPage(otherPartnerId, locale, section), `another partner's ${locale}/${section}`).toBe(false);
    }
  }
  // The host's own prerendered pages keep their copies.
  const { tags } = await getImplicitTags("/(public)/[locale]/login/page", "/en/login", null);
  expect(tags.filter((tag) => expired.includes(tag))).toEqual([]);
});

it.each([
  ["no name", { ...fields, name: " " }, "invalid_name"],
  ["a link that isn't text", { ...fields, termsUrl: 42 }, "invalid_branding"],
  ["a logo that isn't base64", { ...fields, logo: "not base64!" }, "invalid_branding"],
])("answers %s with 400 before saving", async (_case, body, code) => {
  const response = await put(body);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ code });
  expect(fixture.save).not.toHaveBeenCalled();
  expect(expired).toEqual([]);
});

it("refuses a body larger than two images at the size limit before parsing it", async () => {
  const response = await put({ ...fields, logo: "A".repeat(800 * 1024) });
  expect(response.status).toBe(413);
  expect(await response.json()).toMatchObject({ code: "body_too_large" });
  expect(fixture.resolve).not.toHaveBeenCalled();
});

it("passes the domain's refusals through, such as a member saving", async () => {
  fixture.save.mockRejectedValueOnce(Object.assign(new Error("Only owners and admins can change the partner's brand."), { status: 403, code: "forbidden" }));
  const response = await put(fields);
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: "forbidden" });
  fixture.save.mockRejectedValueOnce(Object.assign(new Error("Enter the brand color as a hex code, such as #0f766e."), { status: 400, code: "invalid_color" }));
  expect(await (await put(fields)).json()).toMatchObject({ code: "invalid_color" });
});
