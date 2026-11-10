// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ capabilities: ["activity", "setup"] as string[], loading: false, business: { businessId: "business-1", slug: "acme" } as null | { businessId: string; slug: string } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/hooks/use-active-business", () => ({ useActiveBusiness: () => ({ business: state.business, businesses: { isLoading: state.loading } }) }));
vi.mock("@/components/business-capabilities-provider", () => ({ useBusinessCan: () => (capability: string) => state.capabilities.includes(capability) }));
vi.mock("@/components/dashboard-abandon-intent", () => ({ DashboardAbandonIntent: ({ businessId }: { businessId: string }) => <p>{`survey for ${businessId}`}</p> }));
// The real window registers its opener the way the shell's does, without its own button.
vi.mock("@/components/test-window", async () => {
  const { useEffect } = await import("react");
  const { registerTestWindow } = await import("@/lib/test-window");
  return { TestWindow: ({ trigger }: { trigger?: boolean }) => { useEffect(() => registerTestWindow((options) => opened.push(options)), []); return trigger === false ? null : <button type="button">testCall.trigger</button>; } };
});
const opened = vi.hoisted(() => [] as Array<{ agentId?: string }>);

import { ShellRuntime } from "./shell-runtime";
import { TestCallButton } from "./test-call-button";

afterEach(() => { cleanup(); opened.length = 0; state.capabilities = ["activity", "setup"]; state.loading = false; state.business = { businessId: "business-1", slug: "acme" }; });

describe("the shell's runtime", () => {
  it("keeps the test window and the survey mounted, without a button of the window's own", () => {
    render(<ShellRuntime />);
    expect(screen.getByText("survey for business-1")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "testCall.trigger" })).toBeNull();
  });

  it("opens the window for the agent a Test call button names, or the default agent", async () => {
    render(<><ShellRuntime /><TestCallButton agentId="agent-2" /><TestCallButton /></>);
    const [forAgent, forDefault] = screen.getAllByRole("button", { name: "testCall.trigger" });
    await userEvent.click(forAgent!);
    await userEvent.click(forDefault!);
    expect(opened).toEqual([{ agentId: "agent-2" }, {}]);
  });

  it("mounts no window, and no button, for a business that leaves setup to its partner", () => {
    state.capabilities = ["activity"];
    render(<><ShellRuntime /><TestCallButton /></>);
    expect(screen.queryByRole("button", { name: "testCall.trigger" })).toBeNull();
    expect(screen.getByText("survey for business-1")).toBeTruthy();
  });

  it("holds the button's place while the businesses load", () => {
    state.loading = true;
    state.business = null;
    render(<TestCallButton />);
    const placeholder = screen.getByText("testCall.trigger");
    expect(placeholder.className).toContain("invisible");
    expect(placeholder.closest("[aria-hidden='true']")).toBeTruthy();
  });
});
