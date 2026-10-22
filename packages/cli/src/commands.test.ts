import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { writeConfig } from "./config";
import { exitCodes } from "./errors";
import { BUSINESS, KEY, fakeApi, runCli, tempDir } from "./testing";

const week = [
  { day: "monday", open: "09:00", close: "17:00" },
  { day: "tuesday", open: "09:00", close: "17:00" },
  { day: "saturday", open: "10:00", close: "14:00" },
];

describe("hours", () => {
  it("changes only the days named and sends the rest of the week as it was", async () => {
    const api = fakeApi({
      "GET /api/v1/business": { body: { data: { id: BUSINESS, hours: week } } },
      "PATCH /api/v1/business": (request) => ({ body: { data: { id: BUSINESS, hours: (request.body as { hours: unknown }).hours } } }),
    });
    const result = await runCli(["hours", "set", "--tuesday", "08:00-12:00,13:00-18:00", "--saturday", "closed"], { fetch: api.fetch });
    expect(result.code).toBe(exitCodes.ok);
    expect(api.sent[1]!.body).toEqual({ hours: [
      { day: "monday", open: "09:00", close: "17:00" },
      { day: "tuesday", open: "08:00", close: "12:00" },
      { day: "tuesday", open: "13:00", close: "18:00" },
    ] });
    expect(result.out).toMatch(/tuesday\s+08:00-12:00, 13:00-18:00/);
    expect(result.out).toMatch(/saturday\s+closed/);
    expect((await runCli(["hours", "set", "--monday", "9-5"], { fetch: api.fetch })).code).toBe(exitCodes.invalid);
    expect((await runCli(["hours", "set"], { fetch: api.fetch })).code).toBe(exitCodes.invalid);
  });
});

describe("business use", () => {
  it("checks the key can act on the business, then saves it in the profile", async () => {
    const dir = await tempDir();
    try {
      const path = join(dir.path, "lobbystack", "config.json");
      await writeConfig(path, { current: "default", profiles: { default: { url: "https://app.example.com", key: KEY } } });
      const api = fakeApi({ "GET /api/v1/business": { body: { data: { id: BUSINESS, name: "Acme Dental" } } } });
      const result = await runCli(["business", "use", BUSINESS], { fetch: api.fetch, configHome: dir.path, env: { LOBBYSTACK_URL: "", LOBBYSTACK_API_KEY: "", LOBBYSTACK_BUSINESS: "" } });
      expect(result).toMatchObject({ code: exitCodes.ok, out: `The default profile now acts on Acme Dental (${BUSINESS}).` });
      expect(api.sent[0]!.headers["LobbyStack-Business"]).toBe(BUSINESS);
      expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ current: "default", profiles: { default: { url: "https://app.example.com", key: KEY, business: BUSINESS } } });
      // A business the key can't act on isn't saved.
      const refused = fakeApi({ "GET /api/v1/business": { status: 404, body: { error: { code: "not_found", message: "Business not found." } } } });
      const other = "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6";
      expect(await runCli(["business", "use", other], { fetch: refused.fetch, configHome: dir.path, env: { LOBBYSTACK_URL: "", LOBBYSTACK_API_KEY: "", LOBBYSTACK_BUSINESS: "" } })).toMatchObject({ code: exitCodes.invalid, err: "Business not found." });
      expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ profiles: { default: { business: BUSINESS } } });
      // With the environment's pair there's no profile to save into.
      expect(await runCli(["business", "use", BUSINESS], { fetch: api.fetch, configHome: dir.path })).toMatchObject({ code: exitCodes.invalid, err: expect.stringContaining("Set LOBBYSTACK_BUSINESS instead.") });
      expect((await runCli(["business", "use", "acme"], { configHome: dir.path })).code).toBe(exitCodes.invalid);
    } finally {
      await dir.remove();
    }
  });
});

describe("knowledge upload", () => {
  it("reserves the upload, sends the bytes to its URL without the key, then completes it", async () => {
    const dir = await tempDir();
    try {
      const file = join(dir.path, "prices.pdf");
      await writeFile(file, "%PDF-1.7 prices");
      const uploadId = "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6";
      const api = fakeApi({
        "POST /api/v1/knowledge/uploads": { status: 201, body: { data: { upload_id: uploadId, upload_url: "https://storage.example.net/put?signature=x", upload_headers: { "content-type": "application/pdf" }, expires_at: null } } },
        "PUT https://storage.example.net/put?signature=x": { status: 200 },
        [`POST /api/v1/knowledge/uploads/${uploadId}/complete`]: { status: 202, body: { data: { id: uploadId, type: "file", title: "Prices", status: "pending" } } },
        [`GET /api/v1/knowledge/sources/${uploadId}`]: { body: { data: { id: uploadId, type: "file", title: "Prices", status: "indexed" } } },
      });
      const result = await runCli(["knowledge", "upload", file, "--title", "Prices", "--tags", "pricing,2026", "--wait", "--json"], { fetch: api.fetch });
      expect(result.code).toBe(exitCodes.ok);
      expect(JSON.parse(result.out)).toMatchObject({ status: "indexed" });
      expect(api.sent[0]!.body).toEqual({ file_name: "prices.pdf", content_type: "application/pdf", length: 15, checksum_sha256: createHash("sha256").update("%PDF-1.7 prices").digest("base64") });
      expect(api.sent[1]).toMatchObject({ method: "PUT", headers: { "content-type": "application/pdf" }, redirect: "error" });
      expect(api.sent[1]!.headers).not.toHaveProperty("authorization");
      expect(api.sent[2]!.body).toEqual({ title: "Prices", tags: ["pricing", "2026"] });

      // A relative upload URL, as local storage gives, goes to the dashboard's own address, still without the key.
      const local = fakeApi({
        "POST /api/v1/knowledge/uploads": { status: 201, body: { data: { upload_id: uploadId, upload_url: "/api/storage/local?token=signed", upload_headers: { "content-type": "application/pdf" }, expires_at: null } } },
        "PUT /api/storage/local": { status: 200 },
        [`POST /api/v1/knowledge/uploads/${uploadId}/complete`]: { status: 202, body: { data: { id: uploadId, type: "file", status: "pending" } } },
        [`GET /api/v1/knowledge/sources/${uploadId}`]: { body: { data: { id: uploadId, type: "file", status: "error", error: "The file has no text in it" } } },
      });
      const failed = await runCli(["knowledge", "upload", file, "--wait"], { fetch: local.fetch });
      expect(local.sent[1]).toMatchObject({ method: "PUT", path: "/api/storage/local", query: { token: "signed" } });
      expect(local.sent[1]!.headers).not.toHaveProperty("authorization");
      expect(failed).toMatchObject({ code: exitCodes.failed, err: "Reading it failed: The file has no text in it." });

      await writeFile(join(dir.path, "notes.exe"), "x");
      expect(await runCli(["knowledge", "upload", join(dir.path, "notes.exe")], { fetch: api.fetch })).toMatchObject({ code: exitCodes.invalid, err: expect.stringContaining("isn't a type the receptionist reads") });
    } finally {
      await dir.remove();
    }
  });
});

describe("contact PINs", () => {
  const ana = "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6";
  const milan = "7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e";
  const given = (id: string, name: string, pin: string) => ({ id, name, phone: "+14165550134", passcode: { set_at: "2026-10-13T21:00:00.000Z", locked: false }, new_passcode: pin });

  it("sets and removes PINs from --passcodes, one contact each", async () => {
    const api = fakeApi({ "POST /api/v1/contacts/passcodes": { body: { data: [{ id: ana, name: "Ana", phone: "+14165550134", passcode: { set_at: "2026-10-13T21:00:00.000Z", locked: false } }, { id: milan, name: "Milan", phone: null, passcode: null }], next_cursor: null, has_more: false } } });
    const result = await runCli(["contacts", "set-pins", "--passcodes", JSON.stringify({ contact_id: ana, passcode: "480613" }), "--passcodes", JSON.stringify({ contact_id: milan, passcode: null })], { fetch: api.fetch });
    expect(result.code).toBe(exitCodes.ok);
    expect(api.sent[0]!.body).toEqual({ passcodes: [{ contact_id: ana, passcode: "480613" }, { contact_id: milan, passcode: null }] });
    // Setting a PIN twice changes nothing, and a stored replay would keep the PIN, so no Idempotency-Key is sent.
    expect(api.sent[0]!.headers).not.toHaveProperty("idempotency-key");
    expect(result.out).toMatch(/^ID\s+NAME\s+PHONE\s+PASSCODE/);
    expect(result.out).toContain("\"locked\":false");
  });

  it("gives the named contacts new PINs once and shows them", async () => {
    const api = fakeApi({ "POST /api/v1/contacts/passcodes/generate": { body: { data: { contacts: [given(ana, "Ana", "4806")], remaining: 3 } } } });
    const result = await runCli(["contacts", "generate-pins", ana, "--length", "4"], { fetch: api.fetch });
    expect(result.code).toBe(exitCodes.ok);
    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]!.body).toEqual({ contact_ids: [ana], length: 4 });
    expect(result.out).toMatch(/Ana\s+\+14165550134\s+4806/);
    expect(result.out).toContain("These PINs aren't shown again");
    expect(result.out).toContain("3 contacts with a phone number still have no PIN. To give them one, run lobbystack contacts generate-pins --all.");
  });

  it("keeps going with --all until every contact with a phone number has a PIN", async () => {
    const api = fakeApi({ "POST /api/v1/contacts/passcodes/generate": [
      { body: { data: { contacts: [given(ana, "Ana", "480613")], remaining: 1 } } },
      { body: { data: { contacts: [given(milan, "Milan", "975310")], remaining: 0 } } },
    ] });
    const result = await runCli(["contacts", "generate-pins", "--all", "--json"], { fetch: api.fetch });
    expect(result.code).toBe(exitCodes.ok);
    expect(api.sent.map((request) => request.body)).toEqual([{}, {}]);
    expect(JSON.parse(result.out)).toEqual({ contacts: [given(ana, "Ana", "480613"), given(milan, "Milan", "975310")], remaining: 0 });

    // A request that gives nobody a PIN ends the run instead of looping.
    const stuck = fakeApi({ "POST /api/v1/contacts/passcodes/generate": { body: { data: { contacts: [], remaining: 2 } } } });
    const nothing = await runCli(["contacts", "generate-pins", "--all"], { fetch: stuck.fetch });
    expect(stuck.sent).toHaveLength(1);
    expect(nothing.out).toContain("No contact got a new PIN.");
  });

  it("shows the PINs already given when a later request fails", async () => {
    const api = fakeApi({ "POST /api/v1/contacts/passcodes/generate": [
      { body: { data: { contacts: [given(ana, "Ana", "480613")], remaining: 1 } } },
      { status: 503, body: { error: { code: "rate_limit_unavailable", message: "The API is temporarily unavailable. Retry shortly." } } },
    ] });
    const result = await runCli(["contacts", "generate-pins", "--all"], { fetch: api.fetch });
    expect(result.code).toBe(exitCodes.failed);
    expect(result.out).toMatch(/Ana\s+\+14165550134\s+480613/);
    expect(result.err).toContain("temporarily unavailable");
  });

  it("refuses --all with contact ids, and a length a PIN can't have", async () => {
    const api = fakeApi({});
    expect((await runCli(["contacts", "generate-pins", ana, "--all"], { fetch: api.fetch })).code).toBe(exitCodes.invalid);
    for (const length of ["3", "9", "six", "4.5"]) expect((await runCli(["contacts", "generate-pins", "--length", length], { fetch: api.fetch })).code, length).toBe(exitCodes.invalid);
    expect(api.sent).toHaveLength(0);
  });
});
