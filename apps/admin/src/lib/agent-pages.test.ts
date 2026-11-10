import { expect, it } from "vitest";

import { agentPageOf, agentPathAfterBusinessSwitch } from "./agent-pages";

it("sends an agent's page to the same page of the new business's default agent", () => {
  expect(agentPathAfterBusinessSwitch("/agents/9b2c")).toBe("/agents/primary");
  expect(agentPathAfterBusinessSwitch("/agents/9b2c/channels/phone", "?number=%2B15145550100")).toBe("/agents/primary/channels/phone?number=%2B15145550100");
  expect(agentPathAfterBusinessSwitch("/agents/9b2c/rules", "tab=active")).toBe("/agents/primary/rules?tab=active");
});

it("leaves the pages outside an agent alone", () => {
  for (const path of ["/agents", "/inbox", "/workspace/business", "/"]) expect(agentPathAfterBusinessSwitch(path)).toBeNull();
});

it("knows the agents list isn't an agent's page", () => {
  expect(agentPageOf("/agents")).toBeNull();
  expect(agentPageOf("/agents/9b2c/channels")?.titleKey).toBe("agentPages.channels");
});
