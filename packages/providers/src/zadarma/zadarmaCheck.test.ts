import { describe, expect, it, vi } from "vitest";

import { adviseZadarma, checkZadarma } from "./zadarmaCheck";

type Answer = unknown | Error;
function reader(routes: Record<string, Answer>) {
  const calls: Array<{ path: string; params?: Record<string, unknown> | undefined }> = [];
  return {
    calls,
    client: {
      get: vi.fn(async (path: string, params?: Record<string, unknown>) => {
        calls.push({ path, params });
        const answer = routes[path];
        if (answer instanceof Error) throw answer;
        if (answer === undefined) throw new Error(`no route ${path}`);
        return answer;
      }),
    } as never,
  };
}

const account = {
  "/v1/direct_numbers/": { info: [{ number: "381213860081", status: "on", sip: "536212" }] },
  "/v1/documents/groups/list/": { groups: [{ id: 7, organization: "MILAN OBRENOVIĆ PR", country: "RS", city: "Novi Sad", email: "private@example.com" }] },
  "/v1/direct_numbers/country/": { info: [{ id: 100, areaCode: "11", name: "Belgrade", monthly_fee: 12, currency: "USD", is_toll: "true", receive_sms: "false" }, { id: 102, areaCode: "800", name: "Toll-free", monthly_fee: 26, currency: "USD", is_toll: "true", receive_sms: "true" }] },
  "/v1/direct_numbers/available/100/": { numbers: [{ id: "a" }, { id: "b" }] },
  "/v1/documents/groups/valid/7/": { is_information_match: "true", is_documents_uploaded: "true", is_documents_verified: "true", is_address_match: "false" },
};

describe("checkZadarma", () => {
  it("reads the account and checks each documents group against the landline destinations", async () => {
    const { client, calls } = reader(account);
    const report = await checkZadarma(client, { country: "rs" });
    expect(report.country).toBe("RS");
    expect(report.numbers).toEqual([{ number: "381213860081", status: "on", sip: "536212" }]);
    // Only what the check needs from a group, never its email or other details.
    expect(report.groups).toEqual([{ id: "7", organization: "MILAN OBRENOVIĆ PR", country: "RS", city: "Novi Sad" }]);
    expect(report.directions).toEqual([{ id: "100", areaCode: "11", name: "Belgrade", monthly: "12 USD", toll: false, texts: false }, { id: "102", areaCode: "800", name: "Toll-free", monthly: "26 USD", toll: true, texts: true }]);
    expect(report.sample).toEqual({ direction: "100", name: "Belgrade", available: 2 });
    expect(report.fit).toEqual([{ group: "7", direction: "100", name: "Belgrade", informationMatches: true, documentsUploaded: true, documentsVerified: true, addressMatches: false }]);
    expect(calls.find((call) => call.path === "/v1/documents/groups/valid/7/")?.params).toEqual({ direction_id: "100" });
    // It only reads.
    expect(calls.every((call) => !call.path.includes("order") && !call.path.includes("set_sip_id"))).toBe(true);
  });

  it("checks only the group the deployment names", async () => {
    const { client, calls } = reader({ ...account, "/v1/documents/groups/list/": { groups: [{ id: 7 }, { id: 8 }] }, "/v1/documents/groups/valid/8/": {} });
    const report = await checkZadarma(client, { country: "RS", documentsGroupId: "8" });
    expect(report.fit.map((entry) => entry.group)).toEqual(["8"]);
    expect(calls.some((call) => call.path === "/v1/documents/groups/valid/7/")).toBe(false);
  });

  it("reports a refused request without throwing, and stops there", async () => {
    const { client } = reader({ "/v1/direct_numbers/": new Error("Zadarma /v1/direct_numbers/ answered 401: Wrong signature"), "/v1/documents/groups/list/": new Error("Wrong signature"), "/v1/direct_numbers/country/": new Error("Wrong signature") });
    const report = await checkZadarma(client, { country: "RS" });
    expect(report.numbers).toEqual({ error: expect.stringContaining("Wrong signature") });
    expect(report.fit).toEqual([]);
    expect(adviseZadarma(report, {})[0]).toContain("Check ZADARMA_API_KEY and ZADARMA_API_SECRET");
  });
});

describe("adviseZadarma", () => {
  it("says what to set, from what the account showed", async () => {
    const report = await checkZadarma(reader(account).client, { country: "RS" });
    expect(adviseZadarma(report, {})).toEqual([
      "Set ZADARMA_DOCUMENTS_GROUP_ID on the admin and the worker to one of: 7.",
      "Set ZADARMA_SIP_HOST on the worker to the SIP server's host, and port when it isn't 5060.",
    ]);
  });

  it("says Zadarma is ready when the group and the SIP host are set and a landline is for sale", async () => {
    const report = await checkZadarma(reader(account).client, { country: "RS", documentsGroupId: "7" });
    expect(adviseZadarma(report, { documentsGroupId: "7", sipHost: "sip.example.com:5060" })).toEqual(["Zadarma is ready: the keys sign, a documents group is set, and landline numbers are for sale."]);
  });

  it("warns when no group is verified yet, none exists, or nothing is for sale", async () => {
    const unverified = { ...account, "/v1/documents/groups/valid/7/": { is_information_match: "true", is_documents_verified: "false" } };
    expect(adviseZadarma(await checkZadarma(reader(unverified).client, { country: "RS", documentsGroupId: "7" }), { documentsGroupId: "7", sipHost: "h" }).join(" ")).toContain("waits until Zadarma verifies");
    expect(adviseZadarma(await checkZadarma(reader({ ...account, "/v1/documents/groups/list/": { groups: [] } }).client, { country: "RS" }), { sipHost: "h" }).join(" ")).toContain("no documents group");
    expect(adviseZadarma(await checkZadarma(reader({ ...account, "/v1/direct_numbers/available/100/": { numbers: [] } }).client, { country: "RS", documentsGroupId: "7" }), { documentsGroupId: "7", sipHost: "h" }).join(" ")).toContain("lists no Belgrade numbers to choose from");
  });
});
