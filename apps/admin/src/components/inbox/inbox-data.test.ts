import { describe, expect, it } from "vitest";

import { inboxFilters, inboxHref, inboxRequestUrl, openItemChange, openKey } from "./inbox-data";

const AGENT = "00000000-0000-4000-8000-000000000001";
const params = (query: string) => new URLSearchParams(query);

describe("the Inbox URL", () => {
  it("reads its filters and drops values the API would refuse", () => {
    expect(inboxFilters(params(`channel=instagram&agent=${AGENT}&status=open`), "  late ")).toEqual({ channel: "instagram", agentId: AGENT, open: true, search: "late" });
    expect(inboxFilters(params("channel=fax&agent=front-desk&status=done"))).toEqual({ channel: null, agentId: null, open: false, search: "" });
  });

  it("asks the API for one page of what the filters keep", () => {
    expect(inboxRequestUrl({ channel: "phone_call", agentId: AGENT, open: true, search: "Marie" }, "next")).toBe(`/api/inbox?limit=50&channel=phone_call&agentId=${AGENT}&status=open&search=Marie&cursor=next`);
    expect(inboxRequestUrl({ channel: null, agentId: null, open: false, search: "" })).toBe("/api/inbox?limit=50");
  });

  it("opens one item at a time and keeps the filters", () => {
    const current = params("channel=sms&conversation=c1");
    expect(inboxHref("/inbox", current, openItemChange({ kind: "call", id: "k1" }))).toBe("/inbox?channel=sms&call=k1");
    expect(inboxHref("/inbox", params("call=k1"), { call: null })).toBe("/inbox");
    expect(openKey(params("call=k1"))).toBe("call:k1");
    expect(openKey(params("conversation=c1"))).toBe("conversation:c1");
    expect(openKey(params(""))).toBeNull();
  });
});
