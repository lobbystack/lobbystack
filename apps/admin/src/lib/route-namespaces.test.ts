import { expect, it } from "vitest";
import { routeNamespaces } from "./route-namespaces";

it("keeps login and embed startup independent of dashboard translations", () => {
  expect(routeNamespaces("/fr/login")).toEqual(["common", "auth", "onboarding"]);
  expect(routeNamespaces("/embed/key")).toEqual(["common", "widget"]);
});
it("loads detail-route namespaces alongside shared navigation", () => {
  expect(routeNamespaces("/calls/id")).toEqual(["common", "nav", "settings", "agent", "receptionists", "calls"]);
  expect(routeNamespaces("/inbox")).toEqual(expect.arrayContaining(["receptionists", "calls", "messages", "inbox"]));
  expect(routeNamespaces("/receptionists/id/knowledge")).toEqual(expect.arrayContaining(["receptionists", "knowledge"]));
  expect(routeNamespaces("/analytics")).toContain("dashboard");
  expect(routeNamespaces("/agent/knowledge")).toContain("knowledge");
});
