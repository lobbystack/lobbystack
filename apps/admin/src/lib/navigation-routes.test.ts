import { describe, expect, it } from "vitest";

import { isNewNavigationEnabled } from "./navigation-flag";
import {
  buildSidebarModel,
  isSidebarItemActive,
  legacyToNewPath,
  newToLegacyPath,
  parseReceptionistPath,
  receptionistPath,
  switchReceptionistPath,
} from "./navigation-routes";

const front = { id: "0b8a4c7e-3f1d-4a55-9d3e-2c1f0e9a7b61", name: "Front desk", isDefault: true };
const night = { id: "1c9b5d8f-4a2e-4b66-8e4f-3d2a1f0b8c72", name: "After hours", isDefault: false };

describe("buildSidebarModel", () => {
  it("gives a single-receptionist owner one link and no list", () => {
    const model = buildSidebarModel({ receptionists: [front], staffEnabled: false, canCreateReceptionists: false });
    expect(model.receptionists.single).toEqual({ href: `/receptionists/${front.id}` });
    expect(model.receptionists.list).toEqual([]);
  });

  it("lists every receptionist once there are two", () => {
    const model = buildSidebarModel({ receptionists: [front, night], staffEnabled: false, canCreateReceptionists: true });
    expect(model.receptionists.single).toBeNull();
    expect(model.receptionists.list.map((item) => item.name)).toEqual(["Front desk", "After hours"]);
    expect(model.receptionists.showNew).toBe(true);
  });

  it("orders groups by how often owners use them and hides Staff until it's on", () => {
    const off = buildSidebarModel({ receptionists: [front], staffEnabled: false, canCreateReceptionists: false });
    expect(off.daily.map((item) => item.key)).toEqual(["home", "inbox", "calendar", "contacts", "analytics"]);
    expect(off.business.map((item) => item.key)).toEqual(["services", "knowledge", "numbers"]);
    expect(off.setup.map((item) => item.key)).toEqual(["integrations", "settings"]);
    const on = buildSidebarModel({ receptionists: [front], staffEnabled: true, canCreateReceptionists: false });
    expect(on.business.map((item) => item.key)).toEqual(["services", "staff", "knowledge", "numbers"]);
  });
});

describe("receptionist paths", () => {
  it("parses drill-down URLs and ignores everything else", () => {
    expect(parseReceptionistPath(`/receptionists/${front.id}`)).toEqual({ agentId: front.id, section: "overview" });
    expect(parseReceptionistPath(`/receptionists/${front.id}/transfers`)).toEqual({ agentId: front.id, section: "transfers" });
    expect(parseReceptionistPath(`/receptionists/${front.id}/unknown`)).toBeNull();
    expect(parseReceptionistPath("/receptionists/not-a-uuid")).toBeNull();
    expect(parseReceptionistPath("/services")).toBeNull();
  });

  it("keeps the same page when switching receptionist", () => {
    expect(switchReceptionistPath(`/receptionists/${front.id}/booking`, night.id)).toBe(`/receptionists/${night.id}/booking`);
    expect(switchReceptionistPath(`/receptionists/${front.id}`, night.id)).toBe(receptionistPath(night.id));
  });

  it("marks the matching sidebar item active", () => {
    expect(isSidebarItemActive("/", "/")).toBe(true);
    expect(isSidebarItemActive("/", "/inbox")).toBe(false);
    expect(isSidebarItemActive("/inbox", "/calls/abc")).toBe(true);
    expect(isSidebarItemActive("/settings/usage", "/settings/team")).toBe(true);
    expect(isSidebarItemActive("/services", "/services")).toBe(true);
  });
});

describe("old URL redirects", () => {
  const input = { defaultAgentId: front.id };
  it.each([
    ["/agent", `/receptionists/${front.id}/behavior`],
    ["/agent/basic-settings", `/receptionists/${front.id}/behavior`],
    ["/agent/integrations", `/receptionists/${front.id}/behavior`],
    ["/agent/rules", `/receptionists/${front.id}/transfers`],
    ["/agent/knowledge", "/knowledge"],
    ["/agent/services", "/services"],
    ["/calls", "/inbox?channel=calls"],
    ["/messages", "/inbox?channel=chats"],
    ["/appointments", "/calendar"],
    ["/settings/phone-number", "/numbers"],
    ["/settings/widget", "/numbers#widget"],
  ])("sends %s to %s", (from, to) => {
    expect(legacyToNewPath(from, input)).toBe(to);
  });

  it("keeps query strings so filtered links still work", () => {
    expect(legacyToNewPath("/messages", { ...input, search: "?conversation=abc" })).toBe("/inbox?channel=chats&conversation=abc");
    expect(legacyToNewPath("/appointments", { ...input, search: "?date=2030-01-08" })).toBe("/calendar?date=2030-01-08");
  });

  it("leaves pages that exist in both navigations alone", () => {
    for (const path of ["/", "/contacts", "/analytics", "/integrations", "/settings/usage", "/calls/abc"]) expect(legacyToNewPath(path, input)).toBeNull();
  });

  it("sends new URLs back to the old navigation while the flag is off", () => {
    expect(newToLegacyPath("/inbox")).toBe("/calls");
    expect(newToLegacyPath("/calendar")).toBe("/appointments");
    expect(newToLegacyPath(`/receptionists/${front.id}/transfers`)).toBe("/agent/rules");
    expect(newToLegacyPath(`/receptionists/${front.id}/behavior`)).toBe("/agent");
    expect(newToLegacyPath("/numbers")).toBe("/settings/phone-number");
    expect(newToLegacyPath("/contacts")).toBeNull();
  });
});

describe("isNewNavigationEnabled", () => {
  it("follows the business flag by default", () => {
    expect(isNewNavigationEnabled({ new_navigation: true }, undefined)).toBe(true);
    expect(isNewNavigationEnabled({}, undefined)).toBe(false);
    expect(isNewNavigationEnabled(null, undefined)).toBe(false);
    expect(isNewNavigationEnabled({ new_navigation: "yes" }, undefined)).toBe(false);
  });

  it("lets a deployment force it on or off", () => {
    expect(isNewNavigationEnabled({}, "on")).toBe(true);
    expect(isNewNavigationEnabled({ new_navigation: true }, "off")).toBe(false);
    expect(isNewNavigationEnabled({ new_navigation: true }, "per-business")).toBe(true);
  });
});
