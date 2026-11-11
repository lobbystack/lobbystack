// Shared setup for the phone navigation's tests: a phone-width viewport, the
// providers the dashboard shell gives the menus, and a router that records
// where the menus send the person.
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { vi } from "vitest";

import { BusinessCapabilitiesProvider } from "@/components/business-capabilities-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { UpgradePlanDialogProvider } from "@/components/upgrade-plan-dialog-context";
import { AgentsSeedProvider, type AgentListItem } from "@/hooks/use-agents";

export const agent = (id: string, name: string, overrides: Partial<AgentListItem> = {}): AgentListItem => ({ id, name, isDefault: false, paused: false, phoneNumbers: 0, widgetKeys: 0, instagramAccounts: 0, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...overrides });

export function stubPhone() {
  window.innerWidth = 375;
  vi.stubGlobal("EventSource", class { addEventListener() {} removeEventListener() {} close() {} });
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ get matches() { return query === "(max-width: 767px)" && window.innerWidth < 768; }, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
}

type Options = { capabilities?: string[]; agents?: AgentListItem[]; appointments?: Array<Record<string, unknown>> };

export function renderWithShell(ui: () => ReactNode, { capabilities, agents = [agent("agent-1", "Front desk", { isDefault: true })], appointments = [] }: Options = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Tenant name", active: true, role: "business_owner", ...(capabilities ? { capabilities } : {}) }] });
  client.setQueryData(["billing", "business"], { account: null, permissions: { hasCheckoutAccess: false }, availableCheckoutPlans: [], availableCheckoutIntervals: { starter: [], pro: [] } });
  client.setQueryData(["appointments", "business"], { appointments });
  const tree = () => (
    <QueryClientProvider client={client}>
      <BusinessCapabilitiesProvider initial={["activity", "setup", "team", "billing", "api_keys", "mcp"]}>
        <AgentsSeedProvider seed={{ businessId: "business", agents }}>
          <UpgradePlanDialogProvider onOpen={vi.fn()}>
            <SidebarProvider>{ui()}</SidebarProvider>
          </UpgradePlanDialogProvider>
        </AgentsSeedProvider>
      </BusinessCapabilitiesProvider>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { client, rerender: () => view.rerender(tree()) };
}
