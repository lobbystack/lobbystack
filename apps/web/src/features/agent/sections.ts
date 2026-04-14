export type AgentSection = "knowledge" | "services" | "rules" | "integrations";

export function getAgentSectionFromPathname(pathname: string): AgentSection {
  if (pathname === "/agent/services") {
    return "services";
  }

  if (pathname === "/agent/rules") {
    return "rules";
  }

  if (pathname === "/agent/integrations") {
    return "integrations";
  }

  return "knowledge";
}
