// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardSetupGuideCard } from "./dashboard-setup-guide-card";
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: { completed: number; total: number }) => options ? `${options.completed}/${options.total}` : key }) }));
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); });
function setup(role: string, steps: string[]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role }] });
  client.setQueryData(["setup", "business"], { steps: steps.map((status, index) => ({ name: String(index), status })) });
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><DashboardSetupGuideCard /></QueryClientProvider>);
  return fetchMock;
}
describe("original sidebar setup guide eligibility", () => {
  it("hides the guide from ineligible members without requesting setup data", () => {
    const fetchMock = setup("viewer", ["pending"]);
    expect(screen.queryByRole("button")).toBeNull(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("hides the guide after every step is complete or skipped", () => {
    setup("business_owner", ["complete", "skipped"]);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("shows progress and the original setup destination", () => {
    setup("business_admin", ["complete", "skipped", "pending", "pending", "pending"]);
    expect(screen.getByText("2/5")).toBeTruthy();
    expect(screen.getByRole("button", { name: "sidebar.setupGuide.open" }).getAttribute("href")).toBe("/setup-guide");
  });
});
