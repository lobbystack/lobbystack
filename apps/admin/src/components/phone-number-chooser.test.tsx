// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PhoneNumberChooser, type AvailableNumberSummary, type ClaimResult } from "./phone-number-chooser";
afterEach(cleanup);
const labels = { countryLabel: "Country", areaCodeLabel: "Area code", areaCodePlaceholder: "Area", search: "Search", phoneNumberHeader: "Phone number", select: "Select", loadMore: "Load more", empty: "Empty", loadFailed: "Load failed", searchFailed: "Search failed", claimFailed: "Claim failed", unavailable: "Unavailable" };
function offer(index: number): AvailableNumberSummary { return { e164: `+14165550${String(index).padStart(3, "0")}`, display: `(416) 555-0${String(index).padStart(3, "0")}`, countryCode: "CA", kind: "local", capabilities: { sms: true, voice: true }, selectionContext: { mode: "suggested", countryCode: "CA" }, claimToken: `token-${index}` }; }
function setup(overrides: Partial<React.ComponentProps<typeof PhoneNumberChooser>> = {}) {
  const props = { businessId: "business-1", labels, getErrorMessage: (_error: unknown, fallback: string) => fallback, getInitialNumberSuggestion: vi.fn().mockResolvedValue({ market: { countryCode: "CA", areaCode: "416" }, suggestion: offer(0), alternatives: Array.from({ length: 9 }, (_, i) => offer(i + 1)) }), searchAvailableNumbers: vi.fn().mockResolvedValue({ market: { countryCode: "CA" }, selectionContext: { mode: "suggested", countryCode: "CA" }, numbers: Array.from({ length: 20 }, (_, i) => offer(i)) }), claimNumber: vi.fn().mockResolvedValue({ status: "failed", message: "Failed" }), onClaimed: vi.fn(), ...overrides };
  render(<PhoneNumberChooser {...props} />);
  return props;
}
describe("original phone inventory chooser", () => {
  it("loads the verified market and merges more inventory without duplicates", async () => {
    const props = setup();
    expect(await screen.findByText(offer(0).display)).toBeTruthy();
    expect((screen.getByLabelText("Area code") as HTMLInputElement).value).toBe("416");
    await userEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Select" })).toHaveLength(20));
    expect(props.searchAvailableNumbers).toHaveBeenCalledWith({ businessId: "business-1", mode: "area_code", countryCode: "CA", areaCode: "416", limit: 20 });
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });
  it("omits area-code search for a UK market", async () => {
    setup({ getInitialNumberSuggestion: vi.fn().mockResolvedValue({ market: { countryCode: "GB" }, suggestion: null, alternatives: [] }) });
    expect(await screen.findByText("Empty")).toBeTruthy();
    expect(screen.queryByLabelText("Area code")).toBeNull();
  });
  it("prevents concurrent claims while showing progress only on the chosen number", async () => {
    let resolveClaim!: (result: ClaimResult) => void;
    const claimNumber = vi.fn(() => new Promise<ClaimResult>(resolve => { resolveClaim = resolve; }));
    const props = setup({ claimNumber });
    await screen.findByText(offer(0).display);
    const buttons = screen.getAllByRole("button", { name: "Select" });
    await userEvent.click(buttons[0]!);
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true);
    await userEvent.click(buttons[1]!);
    expect(claimNumber).toHaveBeenCalledTimes(1);
    expect(buttons[0]!.querySelector(".animate-spin")).toBeTruthy();
    expect(buttons[1]!.querySelector(".animate-spin")).toBeNull();
    await act(async () => resolveClaim({ status: "claimed", phoneNumberId: "phone-1", e164: offer(0).e164 }));
    expect(props.onClaimed).toHaveBeenCalledWith({ status: "claimed", phoneNumberId: "phone-1", e164: offer(0).e164 }, offer(0));
  });
});
