// The sidebar's menu levels: the workspace menu, and the menus its sections
// open: Settings, Business and one per agent. A page inside a section opens
// that section's menu. Its back row only shows the workspace menu again,
// without leaving the page.

/** Which menu the sidebar shows. */
export type MenuLevel = "root" | "settings" | "business" | `agent:${string}`;

/** The menu a page opens in: its section's, or the workspace menu outside them. */
export function levelFor(pathname: string): MenuLevel {
  const agent = /^\/agents\/([^/]+)/u.exec(pathname);
  if (agent) return `agent:${agent[1]}`;
  if (/^\/business(\/|$)/u.test(pathname)) return "business";
  if (/^\/(workspace|account|settings)(\/|$)/u.test(pathname)) return "settings";
  return "root";
}

export function agentIdOf(level: MenuLevel): string | null {
  return level.startsWith("agent:") ? level.slice("agent:".length) : null;
}

/** Which way the menu moved, so it slides from the matching side. */
export type Direction = "in" | "out" | "across";

/** The slide from one menu to the next: back out to the workspace menu, between two agents, or into a section. */
export function directionBetween(from: MenuLevel, to: MenuLevel): Direction | null {
  if (from === to) return null;
  if (to === "root") return "out";
  return agentIdOf(from) && agentIdOf(to) ? "across" : "in";
}
