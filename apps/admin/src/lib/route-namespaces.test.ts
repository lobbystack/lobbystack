import { expect, it } from "vitest";
import { routeNamespaces } from "./route-namespaces";

it("keeps login and embed startup independent of dashboard translations", () => {
  expect(routeNamespaces("/login")).toEqual(["common", "auth"]);
  expect(routeNamespaces("/embed/key")).toEqual(["common", "widget"]);
});
it("loads detail-route namespaces alongside shared navigation", () => {
  expect(routeNamespaces("/calls/id")).toEqual(["common", "nav", "settings", "agent", "calls"]);
  expect(routeNamespaces("/analytics")).toContain("dashboard");
  expect(routeNamespaces("/agent/knowledge")).toContain("knowledge");
});
