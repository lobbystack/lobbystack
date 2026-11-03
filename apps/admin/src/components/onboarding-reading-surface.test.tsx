// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingReadingSurface } from "./onboarding-reading-surface";

const { push, router } = vi.hoisted(() => { const push = vi.fn(); return { push, router: { push, prefetch: vi.fn() } }; });
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./onboarding-import-wait", async (importOriginal) => ({ ...await importOriginal<typeof import("./onboarding-import-wait")>(), ImportWaitSlides: () => <p>slides</p> }));

const websiteUrl = "https://example.com/";
const running = { status: "crawling", websiteUrl, importedCount: 1, indexedCount: 0 };

function setup(job: Record<string, unknown> | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, websiteUrl }] });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ documents: job ? [{ id: "document", websiteImport: job }] : [] })));
  render(<QueryClientProvider client={client}><OnboardingReadingSurface /></QueryClientProvider>);
}

beforeEach(() => push.mockReset());
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("the wait after the website step", () => {
  it("goes straight on with no import running", async () => {
    setup(null);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding/verify-phone"));
    expect(screen.queryByText("slides")).toBeNull();
  });

  it("shows only while the import runs, and always lets the operator continue", async () => {
    setup(running);
    await screen.findByText("slides");
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "reading.skip" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding/verify-phone"));
  });

  it("moves on by itself at the limit", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setup(running);
    await screen.findByText("slides");
    await act(() => vi.advanceTimersByTimeAsync(90_000));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding/verify-phone"));
  });
});
