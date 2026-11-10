import { describe, expect, it } from "vitest";

import { agentIdOf, backTarget, follow, levelFor, startTrail } from "./navigation-levels";

describe("levelFor", () => {
  it("gives agents and settings their own menu", () => {
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
  });

  it("reads the agent back out of its level", () => {
    expect(agentIdOf(levelFor("/agents/front-desk/rules"))).toBe("front-desk");
    expect(agentIdOf("settings")).toBeNull();
  });
});

describe("follow", () => {
  it("returns to the page the operator left", () => {
    const inSettings = follow(startTrail("root", "/inbox?agent=front-desk"), "settings", "/workspace/team");
    expect(inSettings.direction).toBe("in");
    expect(backTarget(inSettings)).toEqual({ level: "root", href: "/inbox?agent=front-desk" });
  });

  it("walks back through an agent reached from settings", () => {
    const agent = follow(startTrail("root", "/"), "agent:front-desk", "/agents/front-desk/shared");
    const settings = follow(agent, "settings", "/workspace/knowledge");
    expect(backTarget(settings)).toEqual({ level: "agent:front-desk", href: "/agents/front-desk/shared" });
    const backAtAgent = follow(settings, "agent:front-desk", "/agents/front-desk/shared");
    expect(backAtAgent.direction).toBe("out");
    expect(backTarget(backAtAgent)).toEqual({ level: "root", href: "/" });
  });

  it("keeps the way out when moving between agents", () => {
    const first = follow(startTrail("root", "/analytics"), "agent:front-desk", "/agents/front-desk");
    const second = follow(first, "agent:after-hours", "/agents/after-hours");
    expect(second.direction).toBe("across");
    expect(backTarget(second).href).toBe("/analytics");
  });

  it("keeps the trail and only moves the page within one menu", () => {
    const settings = follow(startTrail("root", "/"), "settings", "/workspace/team");
    const next = follow(settings, "settings", "/workspace/usage");
    expect(next).toEqual({ ...settings, href: "/workspace/usage" });
  });

  it("clears the trail at the workspace menu, and goes Home from a fresh load", () => {
    const fresh = startTrail("settings", "/account");
    expect(backTarget(fresh)).toEqual({ level: "root", href: "/" });
    expect(follow(fresh, "root", "/").stack).toEqual([]);
    expect(follow(fresh, "root", "/").direction).toBe("out");
  });
});
