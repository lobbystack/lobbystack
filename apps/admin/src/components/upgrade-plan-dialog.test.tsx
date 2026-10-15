// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { UpgradePlanDialog } from "./upgrade-plan-dialog";

type Props = ComponentProps<typeof UpgradePlanDialog>;
afterEach(cleanup);
function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    availableCheckoutPlans: ["starter", "pro"], availableCheckoutIntervals: { starter: ["monthly", "annual"], pro: ["monthly", "annual"] },
    billingInterval: "annual", currentPlan: "free_cloud", loading: null, loadingPlan: null, locale: "en",
    onBillingIntervalChange: vi.fn(), onContactEnterprise: vi.fn(), onOpenChange: vi.fn(), onStartCheckout: vi.fn(), open: true,
    selectedPlan: "starter", t: ((key: string) => key) as Props["t"], ...overrides,
  };
  render(<UpgradePlanDialog {...props} />);
  return props;
}
describe("main upgrade dialog", () => {
  it("renders all four original plans and annual checkout pricing", async () => {
    const props = setup();
    expect(screen.getAllByText("Unlimited calls at once")).toHaveLength(4);
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(4);
    expect(screen.getByText("$24")).toBeTruthy();
    expect(screen.getByText("$80")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Get Starter" }));
    expect(props.onStartCheckout).toHaveBeenCalledWith("starter", "annual");
  });
  it("falls back to an available interval without offering an unconfigured checkout", async () => {
    const props = setup({ availableCheckoutPlans: ["pro"], availableCheckoutIntervals: { starter: [], pro: ["monthly"] } });
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    const unavailable = screen.getByRole("button", { name: "Get Starter" });
    expect(unavailable.hasAttribute("disabled")).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Get Pro" }));
    expect(props.onStartCheckout).toHaveBeenCalledWith("pro", "monthly");
  });
  it("keeps the current plan and pending checkout controls disabled", () => {
    setup({ currentPlan: "starter", loading: "checkout", loadingPlan: "pro" });
    expect(screen.getByRole("button", { name: "billing.upgradeDialog.actions.currentPlan" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /Get Pro|billing.actions.openingCheckout/ }).hasAttribute("disabled")).toBe(true);
  });
  it("opens enterprise contact without creating a checkout", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Contact us" }));
    expect(props.onContactEnterprise).toHaveBeenCalledOnce();
    expect(props.onStartCheckout).not.toHaveBeenCalled();
  });
  it.each(["starter", "pro"] as const)("opens on %s as the primary choice", (selectedPlan) => {
    setup({ selectedPlan });
    const selected = screen.getAllByRole("heading", { level: 3 }).map(heading => heading.closest("section")!).filter(card => card.hasAttribute("data-selected"));
    expect(selected.map(card => card.querySelector("h3")?.textContent)).toEqual([selectedPlan === "starter" ? "Starter" : "Pro"]);
  });
  it("changes the billing interval through the original tabs", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("tab", { name: "billing.upgradeDialog.billingIntervals.monthly" }));
    expect(props.onBillingIntervalChange).toHaveBeenCalledWith("monthly");
  });
});
