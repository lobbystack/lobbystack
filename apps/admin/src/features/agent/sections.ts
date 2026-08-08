export type AgentSection = "knowledge" | "services" | "rules";

export function getAgentSectionFromPathname(pathname: string): AgentSection {
  if (pathname === "/agent/services") {
    return "services";
  }

  if (pathname === "/agent/rules") {
    return "rules";
  }

  return "knowledge";
}
