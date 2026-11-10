// The sidebar's menu levels: the workspace menu, the settings menu, and one
// menu per agent. The back row returns to where the operator came from.

/** Which menu the sidebar shows. Agent and settings pages each open their own; everything else keeps the workspace menu. */
export type MenuLevel = "root" | "settings" | `agent:${string}`;

export function levelFor(pathname: string): MenuLevel {
  const agent = /^\/agents\/([^/]+)/u.exec(pathname);
  if (agent) return `agent:${agent[1]}`;
  if (/^\/(workspace|account|settings)(\/|$)/u.test(pathname)) return "settings";
  return "root";
}

export function agentIdOf(level: MenuLevel): string | null {
  return level.startsWith("agent:") ? level.slice("agent:".length) : null;
}

/** A menu the operator came from, and the page to return to. */
export type Frame = { level: MenuLevel; href: string };

/** Which way the menu moved, so it slides from the matching side. */
export type Direction = "in" | "out" | "across";

export type Trail = { level: MenuLevel; href: string; stack: Frame[]; direction: Direction | null };

export function startTrail(level: MenuLevel, href: string): Trail {
  return { level, href, stack: [], direction: null };
}

/**
 * Moves the trail to the page the operator just opened. The back row pops
 * this stack, so it returns to where they came from rather than a fixed parent.
 * Moving between two agents keeps the stack: the back row still leaves agents.
 */
export function follow(trail: Trail, level: MenuLevel, href: string): Trail {
  if (level === trail.level) return { ...trail, href };
  if (level === "root") return { level, href, stack: [], direction: "out" };
  const seen = trail.stack.findIndex((frame) => frame.level === level);
  if (seen >= 0) return { level, href, stack: trail.stack.slice(0, seen), direction: "out" };
  if (agentIdOf(level) && agentIdOf(trail.level)) return { level, href, stack: trail.stack, direction: "across" };
  return { level, href, stack: [...trail.stack, { level: trail.level, href: trail.href }], direction: "in" };
}

/** Where the back row goes. With nothing behind it, as on a fresh load, that's Home. */
export function backTarget(trail: Trail): Frame {
  return trail.stack.at(-1) ?? { level: "root", href: "/" };
}
