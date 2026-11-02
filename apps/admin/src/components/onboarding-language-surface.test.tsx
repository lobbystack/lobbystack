// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";
import { OnboardingLanguageSurface } from "./onboarding-language-surface";

const push = vi.hoisted(() => vi.fn());
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, prefetch: vi.fn() }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

beforeEach(() => { push.mockReset(); telemetryRef.current = createRecordedBrowserTelemetry(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("the language question", () => {
  it("saves the business's language and goes on to the phone", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    client.setQueryData(["businesses"], { businesses: [{ businessId: "business", active: true, defaultLocale: "fr" }] });
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(<QueryClientProvider client={client}><OnboardingLanguageSurface /></QueryClientProvider>);

    await userEvent.click(screen.getByRole("button", { name: "language.continue" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding/verify-phone"));

    const save = fetchMock.mock.calls.find(([url]) => url === "/api/agent");
    expect(JSON.parse(String(save?.[1]?.body))).toEqual({ locale: "fr" });
    const stage = fetchMock.mock.calls.find(([url]) => url.startsWith("/api/onboarding/stage?"));
    expect(JSON.parse(String(stage?.[1]?.body))).toEqual({ to: "verify_phone" });
    telemetryRef.current!.expectEvent("web.onboarding.language_submitted", { businessId: "business", locale: "fr" });
  });
});
