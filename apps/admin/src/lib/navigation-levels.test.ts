import { describe, expect, it } from "vitest";

import { agentIdOf, directionBetween, levelFor } from "./navigation-levels";

describe("levelFor", () => {
  it("gives agents, Business and Settings their own menu", () => {
    expect(levelFor("/business")).toBe("business");
    expect(levelFor("/business/knowledge")).toBe("business");
    expect(levelFor("/agents/front-desk/rules")).toBe("agent:front-desk");
    expect(levelFor("/agents/front-desk/channels/phone")).toBe("agent:front-desk");
    expect(levelFor("/workspace/billing")).toBe("settings");
    expect(levelFor("/account")).toBe("settings");
    expect(levelFor("/settings")).toBe("settings");
  });

  it("keeps the workspace menu everywhere else", () => {
    expect(levelFor("/")).toBe("root");
    expect(levelFor("/agents")).toBe("root");
    expect(levelFor("/inbox")).toBe("root");
    expect(levelFor("/accounting")).toBe("root");
    expect(levelFor("/businesses")).toBe("root");
  });

  it("reads the agent back out of its level", () => {
    expect(agentIdOf(levelFor("/agents/front-desk/rules"))).toBe("front-desk");
    expect(agentIdOf("settings")).toBeNull();
  });
});

describe("directionBetween", () => {
  it("slides into a section, back out to the workspace menu, and across between agents", () => {
    expect(directionBetween("root", "settings")).toBe("in");
    expect(directionBetween("agent:front-desk", "business")).toBe("in");
    expect(directionBetween("business", "root")).toBe("out");
    expect(directionBetween("agent:front-desk", "agent:after-hours")).toBe("across");
    expect(directionBetween("settings", "settings")).toBeNull();
  });
});
