import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalStorageProvider } from "@lobbystack/providers/storage/local";

const partnerId = "5b1f6c43-34a5-4a8e-9a43-6c1f8d5f1c11";
const objectId = "2b3c4d5e-6f70-4812-9abc-def012345678";
const businessId = "00000000-0000-4000-8000-000000000001";
const fixture = vi.hoisted(() => ({
  createUpload: vi.fn(),
  pendingUploadTarget: vi.fn(),
  storage: {} as unknown,
  requireOperator: vi.fn(async () => ({ userId: "user", businessId: "00000000-0000-4000-8000-000000000001", domain: { db: "app" } })),
}));
// The partners the app role reads hosts from.
vi.mock("@/lib/databases", async () => {
  const { fakeBrandDatabase } = await import("@/lib/brand-database.fake");
  return { getDatabase: () => ({ db: fakeBrandDatabase({ saved: async () => [], partners: () => [{ partnerId, name: "Bright Desk", subdomain: "bright.portal.example.test" }] }) }) };
});
vi.mock("@/lib/error-reporting", () => ({ reportServerError: vi.fn() }));
vi.mock("@/lib/operator-request", async () => ({ ...(await import("@/lib/operator-request.fake")), requireOperator: fixture.requireOperator }));
vi.mock("@/lib/storage", () => ({ getStorageProvider: () => fixture.storage }));
vi.mock("@lobbystack/domain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@lobbystack/domain")>()),
  createUpload: fixture.createUpload,
  pendingUploadTarget: fixture.pendingUploadTarget,
}));

import { forgetCachedBranding } from "@/lib/branding";
import { fakeOperator, resetFakeOperator } from "@/lib/operator-request.fake";
import { throughProxy } from "@/lib/proxy-pipeline.fake";
import { PUT as relay } from "./content/route";
import { POST as create } from "./route";

const partnerHost = "https://bright.portal.example.test";
const hostDomain = "https://desk.example.test";
const file = new Uint8Array([1, 2, 3, 4]);
const presigned = { url: "https://bucket.storage.example/business/knowledge/doc.pdf?X-Amz-Signature=abc", headers: { "content-type": "application/pdf", "content-length": "4", "x-amz-checksum-sha256": "c3VtCg==" } };
const createBody = JSON.stringify({ businessId, purpose: "knowledge", fileName: "doc.pdf", contentType: "application/pdf", length: 4, checksum: "c3VtCg==" });
const target = { key: "business/knowledge/doc.pdf", contentType: "application/pdf", length: 4, checksum: "c3VtCg==" };

function relayTo(origin: string, init: { body?: BodyInit; headers?: Record<string, string> } = {}) {
  return throughProxy(relay, `${origin}/api/uploads/content?businessId=${businessId}&objectId=${objectId}`, { method: "PUT", body: init.body ?? file, headers: { origin, "content-type": "application/pdf", ...init.headers } });
}

beforeEach(() => {
  vi.stubEnv("APP_BASE_URL", hostDomain);
  vi.stubEnv("PARTNER_BASE_DOMAIN", "portal.example.test");
  resetFakeOperator();
  fakeOperator.businessId = businessId;
  fixture.createUpload.mockResolvedValue({ objectId, key: target.key, ...presigned });
  fixture.pendingUploadTarget.mockResolvedValue(target);
  fixture.storage = { createUpload: vi.fn(async () => presigned) };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  forgetCachedBranding();
});

describe("uploads from a partner's host", () => {
  it("sends the file to the bucket from the host's domain and to its own origin from a partner's host", async () => {
    const onHost = await throughProxy(create, `${hostDomain}/api/uploads`, { method: "POST", body: createBody, headers: { origin: hostDomain, "content-type": "application/json" } });
    expect(onHost.status).toBe(201);
    expect(await onHost.json()).toMatchObject({ objectId, url: presigned.url });

    const onPartner = await throughProxy(create, `${partnerHost}/api/uploads`, { method: "POST", body: createBody, headers: { origin: partnerHost, "content-type": "application/json" } });
    expect(onPartner.status).toBe(201);
    const upload = await onPartner.json();
    // Nothing in the answer names the bucket or the host's domain.
    expect(JSON.stringify(upload)).not.toContain("storage.example");
    expect(upload).toEqual({ objectId, key: target.key, url: `/api/uploads/content?businessId=${businessId}&objectId=${objectId}`, headers: { "content-type": "application/pdf" } });
  });

  it("passes the file on to the bucket with the signed upload the host's domain gets", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await relayTo(partnerHost);
    expect(response.status).toBe(204);
    expect(fixture.pendingUploadTarget).toHaveBeenCalledWith({ db: "app" }, { userId: "user", businessId, objectId });
    expect(fetchMock).toHaveBeenCalledWith(presigned.url, expect.objectContaining({ method: "PUT", headers: { "content-type": "application/pdf", "x-amz-checksum-sha256": "c3VtCg==" } }));
    expect(new Uint8Array((fetchMock.mock.calls[0] as unknown as [string, { body: Uint8Array }])[1].body)).toEqual(file);

    fetchMock.mockResolvedValueOnce(new Response("SignatureDoesNotMatch", { status: 403 }));
    expect((await relayTo(partnerHost)).status).toBe(502);
  });

  it("writes the file straight to local storage", async () => {
    const putObject = vi.fn(async () => undefined);
    fixture.storage = Object.assign(Object.create(LocalStorageProvider.prototype), { putObject });
    expect((await relayTo(partnerHost)).status).toBe(204);
    expect(putObject).toHaveBeenCalledWith({ key: target.key, body: file, contentType: "application/pdf", checksum: "c3VtCg==" });
  });

  it("refuses a file that isn't the one the upload was created for", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await relayTo(partnerHost, { headers: { "content-type": "text/plain" } })).status).toBe(400);
    expect((await relayTo(partnerHost, { body: new Uint8Array([1, 2, 3, 4, 5]) })).status).toBe(400);
    expect((await relayTo(partnerHost, { body: new Uint8Array([1, 2]) })).status).toBe(400);
    fixture.pendingUploadTarget.mockResolvedValueOnce(null);
    expect((await relayTo(partnerHost)).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("takes a file only from the origin the proxy resolved, and nothing on an unknown hostname", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await relayTo(partnerHost, { headers: { origin: hostDomain } })).status).toBe(403);
    expect((await relayTo("https://other.portal.example.test")).status).toBe(404);
    expect(fixture.requireOperator).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
