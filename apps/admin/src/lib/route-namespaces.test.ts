import { expect, it } from "vitest";
import { DASHBOARD_NAMESPACES, routeNamespaces } from "./route-namespaces";

it("keeps login and embed startup independent of dashboard translations", () => {
  expect(routeNamespaces("/fr/login")).toEqual(["common", "auth", "onboarding"]);
  expect(routeNamespaces("/embed/key")).toEqual(["common", "widget"]);
});
it("gives the checkout return page its shell and billing copy without the dashboard", () => {
  expect(routeNamespaces("/billing/success")).toEqual(["common", "onboarding", "settings"]);
});
it("gives the no-businesses page onboarding's shell without the dashboard", () => {
  expect(routeNamespaces("/no-businesses")).toEqual(["common", "onboarding"]);
});
it("gives every dashboard route all dashboard namespaces, so a language change loads them together", () => {
  for (const path of ["/", "/calls/id", "/analytics", "/agent/knowledge", "/affiliate", "/fr/settings/team", "/unknown"]) {
    expect(routeNamespaces(path)).toEqual(DASHBOARD_NAMESPACES);
  }
  expect(DASHBOARD_NAMESPACES).toEqual(expect.arrayContaining(["dashboard", "calls", "knowledge", "affiliate"]));
});
it("gives the partner console its own copy, its Demos page's and the account form's, without the rest of the business dashboard's", () => {
  for (const path of ["/partner", "/partner/login", "/partner/signup", "/partner/accept-invite", "/partner/id/businesses", "/partner/id/team", "/partner/id/demos"]) {
    expect(routeNamespaces(path)).toEqual(["common", "nav", "onboarding", "partner", "demos", "auth"]);
  }
});
