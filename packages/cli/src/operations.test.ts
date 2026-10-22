import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { apiOperations, type ApiOperationId } from "@lobbystack/shared";
import { describe, expect, it } from "vitest";

import { login, logout, profiles, whoami } from "./account";
import { groups } from "./commands";
import { exitCodes } from "./errors";
import { BUSINESS, fakeApi, runCli, tempDir } from "./testing";

const ruleId = "7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e";
const otherId = "0b7c1d2e-3f40-4a51-8b62-7c83d94ea5b6";

describe("one command per endpoint", () => {
  it("gives every v1 operation a command", () => {
    const covered = new Set<ApiOperationId>([login, logout, whoami, profiles, ...Object.values(groups).flatMap((group) => Object.values(group.commands))].flatMap((command) => command.operations ?? []));
    expect((Object.keys(apiOperations) as ApiOperationId[]).filter((id) => !covered.has(id))).toEqual([]);
  });

  it("sends path values, flags and positionals where the operation takes them", async () => {
    const api = fakeApi({ [`PATCH /api/v1/rules/${ruleId}`]: { body: { data: { id: ruleId, title: "Hours", content: "x", active: false } } } });
    expect((await runCli(["rules", "update", ruleId, "--title", "Hours", "--no-active"], { fetch: api.fetch })).code).toBe(exitCodes.ok);
    expect(api.sent[0]).toMatchObject({ method: "PATCH", path: `/api/v1/rules/${ruleId}`, body: { title: "Hours", active: false }, headers: { "LobbyStack-Business": BUSINESS } });

    const services = fakeApi({ "POST /api/v1/services": { status: 201, body: { data: { id: otherId, name: "Cut" } } } });
    await runCli(["services", "add", "Cut", "--duration-minutes", "30", "--staff-ids", `${ruleId},${otherId}`], { fetch: services.fetch });
    expect(services.sent[0]!.body).toEqual({ name: "Cut", duration_minutes: 30, staff_ids: [ruleId, otherId] });

    const reorder = fakeApi({ "POST /api/v1/rules/reorder": { body: { data: [], next_cursor: null, has_more: false } } });
    await runCli(["rules", "reorder", ruleId, otherId], { fetch: reorder.fetch });
    expect(reorder.sent[0]!.body).toEqual({ rule_ids: [ruleId, otherId] });

    const faq = fakeApi({ "POST /api/v1/knowledge": { status: 201, body: { data: { id: otherId } } } });
    await runCli(["knowledge", "add-faq", "--question", "Parking?", "--answer", "Out back."], { fetch: faq.fetch });
    expect(faq.sent[0]!.body).toEqual({ type: "faq", question: "Parking?", answer: "Out back." });

    const cap = fakeApi({ "PATCH /api/v1/billing": { body: { data: { plan: "starter" } } } });
    await runCli(["billing", "cap", "null"], { fetch: cap.fetch });
    expect(cap.sent[0]!.body).toEqual({ spending_cap_cents: null });
  });

  it("takes a whole body from --data, flags and files over it", async () => {
    const dir = await tempDir();
    try {
      await writeFile(join(dir.path, "rule.txt"), "Never book after 6 pm.");
      const api = fakeApi({ "POST /api/v1/rules": { status: 201, body: { data: { id: ruleId } } } });
      await runCli(["rules", "add", "--data", "{\"title\":\"A\",\"content\":\"B\",\"active\":true}", "--title", "Evenings", "--content-file", join(dir.path, "rule.txt")], { fetch: api.fetch });
      expect(api.sent[0]!.body).toEqual({ title: "Evenings", content: "Never book after 6 pm.", active: true });
      expect((await runCli(["rules", "add", "--data", "[1]"], { fetch: api.fetch })).code).toBe(exitCodes.invalid);
    } finally {
      await dir.remove();
    }
  });

  it("passes query flags, and --all follows next_cursor through every page", async () => {
    const services = fakeApi({ "GET /api/v1/services": { body: { data: [], next_cursor: null, has_more: false } } });
    await runCli(["services", "list", "--include-inactive"], { fetch: services.fetch });
    expect(services.sent[0]!.query).toEqual({ include_inactive: "true" });

    const pages = fakeApi({ "GET /api/v1/contacts": [
      { body: { data: [{ id: ruleId, name: "Sam" }], next_cursor: "page-2", has_more: true } },
      { body: { data: [{ id: otherId, name: "Ana" }], next_cursor: null, has_more: false } },
    ] });
    const all = await runCli(["contacts", "list", "--name", "a", "--limit", "1", "--all", "--json"], { fetch: pages.fetch });
    expect(JSON.parse(all.out)).toEqual({ data: [{ id: ruleId, name: "Sam" }, { id: otherId, name: "Ana" }], next_cursor: null, has_more: false });
    expect(pages.sent.map((request) => request.query)).toEqual([{ name: "a", limit: "1" }, { name: "a", limit: "1", cursor: "page-2" }]);

    const one = fakeApi({ "GET /api/v1/contacts": { body: { data: [{ id: ruleId, name: "Sam" }], next_cursor: "page-2", has_more: true } } });
    const page = await runCli(["contacts", "list"], { fetch: one.fetch });
    expect(page.out).toMatch(/NAME[\s\S]*Sam/);
    expect(page.out).toContain("More with --cursor page-2, or --all.");
  });

  it("makes up an Idempotency-Key where one is required, and offers it for a safe retry when the call fails", async () => {
    const created = fakeApi({ "POST /api/v1/businesses": { status: 201, body: { data: { id: otherId, name: "Acme" } } } });
    await runCli(["business", "create", "Acme", "--timezone", "America/Toronto"], { fetch: created.fetch });
    expect(created.sent[0]!.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.sent[0]!.headers).not.toHaveProperty("LobbyStack-Business");

    const failed = fakeApi({ "POST /api/v1/businesses": { status: 500, body: { error: { code: "internal_error", message: "Something went wrong on our side." } } } });
    const result = await runCli(["business", "create", "Acme", "--timezone", "America/Toronto"], { fetch: failed.fetch });
    expect(result.code).toBe(exitCodes.failed);
    expect(result.err).toContain(`run the same command with --idempotency-key ${failed.sent[0]!.headers["idempotency-key"]}`);

    const given = fakeApi({ "POST /api/v1/businesses": { status: 201, body: { data: { id: otherId } } } });
    await runCli(["business", "create", "Acme", "--timezone", "UTC", "--idempotency-key", "acme-1"], { fetch: given.fetch });
    expect(given.sent[0]!.headers["idempotency-key"]).toBe("acme-1");
  });

  it("waits for a claim with --wait, checking until it's done", async () => {
    const claim = (status: string) => ({ body: { data: { id: otherId, status, phone_number: "+14165550123" } } });
    const api = fakeApi({ "POST /api/v1/phone-numbers/claims": { status: 202, ...claim("pending") }, [`GET /api/v1/phone-numbers/claims/${otherId}`]: [claim("provisioning"), claim("claimed")] });
    const result = await runCli(["numbers", "claim", "offer-token", "--wait", "--json"], { fetch: api.fetch });
    expect(JSON.parse(result.out)).toMatchObject({ status: "claimed" });
    expect(api.sent.map((request) => `${request.method} ${request.path}`)).toEqual(["POST /api/v1/phone-numbers/claims", `GET /api/v1/phone-numbers/claims/${otherId}`, `GET /api/v1/phone-numbers/claims/${otherId}`]);
    expect(api.sent[0]!.body).toEqual({ offer_token: "offer-token" });
  });

  it("exits with 1 when the work it waited on failed, and offers no retry for it", async () => {
    const api = fakeApi({
      "POST /api/v1/phone-numbers/claims": { status: 202, body: { data: { id: otherId, status: "pending" } } },
      [`GET /api/v1/phone-numbers/claims/${otherId}`]: { body: { data: { id: otherId, status: "failed", error: "The carrier no longer offers this number" } } },
    });
    const result = await runCli(["numbers", "claim", "offer-token", "--wait", "--json"], { fetch: api.fetch });
    expect(result.code).toBe(exitCodes.failed);
    expect(JSON.parse(result.out)).toMatchObject({ status: "failed" });
    expect(JSON.parse(result.err)).toEqual({ error: { message: "The claim failed: The carrier no longer offers this number. Search again for another number.", exit_code: exitCodes.failed } });
  });

  it("makes up an Idempotency-Key for every operation that takes one, and shows it to scripts when the call fails", async () => {
    const failed = fakeApi({ "POST /api/v1/services": { status: 503, body: { error: { code: "rate_limit_unavailable", message: "The API is temporarily unavailable. Retry shortly." } } } });
    const result = await runCli(["services", "add", "Cut", "--duration-minutes", "30", "--json"], { fetch: failed.fetch });
    const key = failed.sent[0]!.headers["idempotency-key"];
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(result.err)).toMatchObject({ error: { status: 503, idempotency_key: key, message: expect.stringContaining(`--idempotency-key ${key}`) } });
  });

  it("stops paging when the API repeats a cursor, rather than looping", async () => {
    const api = fakeApi({ "GET /api/v1/contacts": { body: { data: [{ id: ruleId }], next_cursor: "same", has_more: true } } });
    const result = await runCli(["contacts", "list", "--all"], { fetch: api.fetch });
    expect(result).toMatchObject({ code: exitCodes.failed, err: expect.stringContaining("same next_cursor twice") });
    expect(api.sent).toHaveLength(2);
  });

  it("takes a list of objects as JSON, and keeps a body field from turning into a query parameter", async () => {
    const api = fakeApi({ "PATCH /api/v1/business": { body: { data: { id: BUSINESS } } } });
    const monday = JSON.stringify({ day: "monday", open: "09:00", close: "17:00" });
    const tuesday = JSON.stringify([{ day: "tuesday", open: "09:00", close: "12:00" }, { day: "tuesday", open: "13:00", close: "17:00" }]);
    await runCli(["business", "update", "--hours", monday, "--hours", tuesday], { fetch: api.fetch });
    expect(api.sent[0]!.body).toEqual({ hours: [{ day: "monday", open: "09:00", close: "17:00" }, { day: "tuesday", open: "09:00", close: "12:00" }, { day: "tuesday", open: "13:00", close: "17:00" }] });
    const search = fakeApi({ "POST /api/v1/phone-numbers/search": { body: { data: [], next_cursor: null, has_more: false } } });
    await runCli(["numbers", "search", "--limit", "5", "--area-code", "416"], { fetch: search.fetch });
    expect(search.sent[0]).toMatchObject({ body: { limit: 5, area_code: "416" }, query: {} });
  });

  it("explains its arguments and marks required flags in help, with the flags every command takes", async () => {
    const help = (await runCli(["services", "update", "--help"])).out;
    expect(help).toContain("Arguments:\n  <service_id>  The service id.");
    expect(help).toContain("Options for every command:");
    expect((await runCli(["services", "add", "--help"])).out).toMatch(/--duration-minutes <number>\s+Required\. /);
    expect((await runCli(["onboarding", "skip", "--help"])).out).toContain("none sends an empty list");
  });

  it("explains missing or extra arguments, and shows what a removal did", async () => {
    expect(await runCli(["rules", "update"])).toMatchObject({ code: exitCodes.invalid, err: expect.stringContaining("Missing <rule_id>.") });
    expect(await runCli(["rules", "remove", ruleId, "extra"])).toMatchObject({ code: exitCodes.invalid, err: expect.stringContaining("Too many arguments: extra") });
    expect(await runCli(["rules", "reorder"])).toMatchObject({ code: exitCodes.invalid, err: expect.stringContaining("Missing <rule_ids>.") });
    expect(await runCli(["rules", "frobnicate"])).toMatchObject({ code: exitCodes.invalid, err: expect.stringContaining("There's no rules frobnicate command.") });
    const api = fakeApi({ [`DELETE /api/v1/rules/${ruleId}`]: { body: { data: { id: ruleId, deleted: true } } } });
    expect(await runCli(["rules", "remove", ruleId], { fetch: api.fetch })).toMatchObject({ code: exitCodes.ok, out: `Deleted ${ruleId}.` });
    expect((await runCli(["rules"])).out).toContain("Put the rules in order");
    expect((await runCli(["services", "add", "--help"])).out).toContain("--duration-minutes <number>");
  });
});
