import { expect, it } from "vitest";
import { DASHBOARD_NAMESPACES, routeNamespaces } from "./route-namespaces";

it("keeps login and embed startup independent of dashboard translations", () => {
  expect(routeNamespaces("/fr/login")).toEqual(["common", "auth", "onboarding"]);
  expect(routeNamespaces("/embed/key")).toEqual(["common", "widget"]);
});
it("gives every dashboard route all dashboard namespaces, so a language change loads them together", () => {
  for (const path of ["/", "/calls/id", "/analytics", "/agent/knowledge", "/affiliate", "/fr/settings/team", "/unknown"]) {
    expect(routeNamespaces(path)).toEqual(DASHBOARD_NAMESPACES);
  }
  expect(DASHBOARD_NAMESPACES).toEqual(expect.arrayContaining(["dashboard", "calls", "knowledge", "affiliate"]));
});
