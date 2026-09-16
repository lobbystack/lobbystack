// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveSetupGuideSurface } from "./live-setup-guide-surface";
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: { completed?: number; total?: number }) => key === "sidebar.setupGuide.description" ? `${options?.completed}/${options?.total}` : key }) }));
const order = ["website", "sources", "calendar", "services", "rules"];
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.clearAllMocks(); });
function setup(completed: string[] = [], skipped: string[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }); clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, role: "business_owner" }] });
  const steps = order.map(id => ({ id, status: completed.includes(id) ? "complete" : skipped.includes(id) ? "skipped" : "needs setup" }));
  client.setQueryData(["setup", "business"], { steps });
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") { const { stepId } = JSON.parse(String(init.body)); steps.find(step => step.id === stepId)!.status = "skipped"; }
    return Response.json({ steps });
  }); vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><LiveSetupGuideSurface /></QueryClientProvider>);
  return fetchMock;
}
describe("original setup guide interactions", () => {
  it("opens the first incomplete step with checklist progress", () => {
    setup(["website", "services"]); expect(screen.getByText("2/5")).toBeTruthy();
    expect(screen.getByRole("button", { name: "sidebar.setupGuide.stepActions.sources" })).toBeTruthy();
  });
  it("persists skipping a step and advances the accordion", async () => {
    const fetchMock = setup(["website", "services"]);
    await userEvent.click(screen.getByRole("button", { name: "sidebar.setupGuide.skipStep" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/setup?businessId=business", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ stepId: "sources", skipped: true }) })));
    expect(await screen.findByRole("button", { name: "sidebar.setupGuide.stepActions.calendar" })).toBeTruthy();
  });
  it.each(["complete", "skipped"])("keeps %s steps closed", async status => {
    setup(status === "complete" ? ["website"] : [], status === "skipped" ? ["website"] : []);
    await userEvent.click(screen.getByRole("button", { name: "sidebar.setupGuide.steps.website" }));
    expect(screen.queryByRole("button", { name: "sidebar.setupGuide.stepActions.website" })).toBeNull();
    expect(screen.getByRole("button", { name: "sidebar.setupGuide.stepActions.sources" })).toBeTruthy();
  });
  it("persists remaining skips before leaving", async () => {
    const fetchMock = setup(["website", "services"]);
    await userEvent.click(screen.getByRole("button", { name: "sidebar.setupGuide.skip" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/"));
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH").map(([, init]) => JSON.parse(String(init!.body)).stepId)).toEqual(["sources", "calendar", "rules"]);
  });
  it.each([
    ["website", "/agent/knowledge?setup=website"], ["sources", "/agent/knowledge?setup=upload"], ["calendar", "/integrations?setup=calendar"], ["services", "/agent/services?setup=service"], ["rules", "/agent/rules?setup=rule"],
  ])("opens the original %s target", async (step, target) => {
    setup(order.slice(0, order.indexOf(step!)));
    await userEvent.click(screen.getByRole("button", { name: `sidebar.setupGuide.stepActions.${step}` }));
    expect(router.push).toHaveBeenCalledWith(target);
  });
  it("redirects after every step is complete or skipped", async () => {
    setup(["website", "sources"], ["calendar", "services", "rules"]);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/"));
  });
});
