// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingReadingSurface } from "./onboarding-reading-surface";

const { push, router } = vi.hoisted(() => { const push = vi.fn(); return { push, router: { push, prefetch: vi.fn() } }; });
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("./onboarding-import-wait", async (importOriginal) => ({ ...await importOriginal<typeof import("./onboarding-import-wait")>(), ImportWaitSlides: ({ status }: { status?: React.ReactNode }) => <div><p>slides</p>{status}</div> }));

const websiteUrl = "https://example.com/";
const running = { status: "crawling", websiteUrl, importedCount: 1, indexedCount: 0 };
const done = { status: "completed", websiteUrl, importedCount: 4, indexedCount: 4 };

function setup(documents: () => unknown[], documentId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, websiteUrl }] });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ documents: documents() })));
  render(<QueryClientProvider client={client}><OnboardingReadingSurface documentId={documentId} /></QueryClientProvider>);
}

beforeEach(() => push.mockReset());
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("the wait after the website step", () => {
  it("goes straight on with no import running", async () => {
    setup(() => []);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding/number"));
    expect(screen.queryByText("slides")).toBeNull();
  });

  it("shows only while the import runs, and always lets the operator continue", async () => {
    setup(() => [{ id: "document", websiteImport: running }]);
    await screen.findByText("slides");
    expect(screen.getByText("reading.status")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "reading.skip" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding/number"));
  });

  it("moves on by itself at the limit", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setup(() => [{ id: "document", websiteImport: running }]);
    await screen.findByText("slides");
    await act(() => vi.advanceTimersByTimeAsync(90_000));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding/number"));
  });

  it("waits at once for a just-submitted website, then follows its import", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let answer: unknown[] = [];
    setup(() => answer, "document");
    // The slides show before the first knowledge read answers.
    await screen.findByText("slides");
    expect(push).not.toHaveBeenCalled();
    // The import is not there yet: keep waiting and look again.
    answer = [{ id: "document", websiteImport: running }];
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    await waitFor(() => expect(push).not.toHaveBeenCalled());
    expect(screen.getByText("slides")).toBeTruthy();
    // It finishes: move on.
    answer = [{ id: "document", websiteImport: done }];
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding/number"));
  });

  it("moves on at once when the submitted import already finished", async () => {
    setup(() => [{ id: "document", websiteImport: done }], "document");
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding/number"));
    expect(screen.queryByText("slides")).toBeNull();
  });

  it("holds a submitted website to the limit when its import never appears", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setup(() => [], "document");
    await screen.findByText("slides");
    await act(() => vi.advanceTimersByTimeAsync(90_000));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding/number"));
  });
});
