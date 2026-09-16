// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillingPastDueBanner } from "./billing-past-due-banner";

const errorToast = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: errorToast } }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const props = { businessId: "business", plan: "pro", subscriptionState: "past_due", permissions: { hasBillingManagementAccess: true, hasCustomerPortalAccess: true, hasCheckoutAccess: true } };

describe("past-due billing banner", () => {
  it("does not show billing warnings to read-only members", () => {
    render(<BillingPastDueBanner {...props} permissions={{ ...props.permissions, hasBillingManagementAccess: false }} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it.each(["free_cloud", "self_host", "enterprise"])("does not display the hosted recovery banner for %s", (plan) => {
    render(<BillingPastDueBanner {...props} plan={plan} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("shows the warning without an unavailable portal action", () => {
    render(<BillingPastDueBanner {...props} permissions={{ ...props.permissions, hasCustomerPortalAccess: false }} />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("shows loading, reports failure and allows retry", async () => {
    let resolveResponse!: (response: Response) => void;
    const request = vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    vi.stubGlobal("fetch", request);
    render(<BillingPastDueBanner {...props} />);
    fireEvent.click(screen.getByRole("button"));
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button").getAttribute("aria-busy")).toBe("true");
    expect(request).toHaveBeenCalledWith("/api/billing/portal?businessId=business", { method: "POST", credentials: "include" });
    resolveResponse(new Response(null, { status: 503 }));
    await waitFor(() => expect(errorToast).toHaveBeenCalledWith("billing.toast.portalFailed"));
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
  });
});
