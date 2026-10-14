// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { defaultGreeting } from "@lobbystack/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingGreetingSurface } from "./onboarding-greeting-surface";
import { createRecordedBrowserTelemetry } from "@/lib/telemetry-testing";

const navigation = vi.hoisted(() => ({ push: vi.fn(), prefetch: vi.fn() }));
const telemetryRef = vi.hoisted(() => ({ current: null as ReturnType<typeof createRecordedBrowserTelemetry> | null }));
vi.mock("@/components/product-analytics", () => ({ useTelemetry: () => telemetryRef.current!.telemetry }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));

const clients: QueryClient[] = [];
beforeEach(() => { telemetryRef.current = createRecordedBrowserTelemetry(); navigation.push.mockReset(); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

function setup(greeting = "Hi there", business: Record<string, unknown> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  clients.push(client);
  client.setQueryData(["businesses"], { businesses: [{ businessId: "business", name: "Clinic", defaultLocale: "en", active: true, ...business }] });
  client.setQueryData(["onboarding-agent", "business"], { profile: { greeting } });
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => url === "/api/businesses" ? Response.json({ businesses: [{ businessId: "business", active: true }] }) : Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  render(<QueryClientProvider client={client}><OnboardingGreetingSurface /></QueryClientProvider>);
  return fetchMock;
}

const sentAgentPatch = (fetchMock: ReturnType<typeof setup>) => JSON.parse(String(fetchMock.mock.calls.find(([url]) => url === "/api/agent")?.[1]?.body));

describe("onboarding greeting telemetry", () => {
  it("records the submitted greeting once the workspace save completes", async () => {
    const fetchMock = setup();
    const textarea = (await screen.findByLabelText("greeting.label")) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe("Hi there"));
    await userEvent.click(screen.getByRole("button", { name: "greeting.continue" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/onboarding/test-call"));
    const stageCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/onboarding/stage?"));
    expect(stageCall).toBeTruthy();
    expect(JSON.parse(String(stageCall?.[1]?.body))).toEqual({ to: "test_call" });
    telemetryRef.current!.expectEvent("web.onboarding.greeting_submitted", { businessId: "business" });
  });
});

describe("onboarding caller language", () => {
  it("starts in the browser's language and puts the default greeting in the language picked", async () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("pt-BR");
    const fetchMock = setup(defaultGreeting("Clinic"));
    const select = (await screen.findByLabelText("greeting.language")) as HTMLSelectElement;
    const textarea = screen.getByLabelText("greeting.label") as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe(defaultGreeting("Clinic", "pt")));
    expect(select.value).toBe("pt");

    await userEvent.selectOptions(select, "de");
    expect(textarea.value).toBe(defaultGreeting("Clinic", "de"));
    await userEvent.click(screen.getByRole("button", { name: "greeting.continue" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith("/onboarding/test-call"));
    expect(sentAgentPatch(fetchMock)).toEqual({ greeting: defaultGreeting("Clinic", "de"), locale: "de" });
  });

  it("starts from the language the owner saved when they come back to the step", async () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    const fetchMock = setup(defaultGreeting("Clinic", "de"), { defaultLocale: "de", onboardingStage: "test_call" });
    const select = (await screen.findByLabelText("greeting.language")) as HTMLSelectElement;
    await waitFor(() => expect((screen.getByLabelText("greeting.label") as HTMLTextAreaElement).value).toBe(defaultGreeting("Clinic", "de")));
    expect(select.value).toBe("de");
    await userEvent.click(screen.getByRole("button", { name: "greeting.continue" }));
    await waitFor(() => expect(navigation.push).toHaveBeenCalled());
    expect(sentAgentPatch(fetchMock)).toEqual({ greeting: defaultGreeting("Clinic", "de"), locale: "de" });
  });

  it("starts in English when the browser's language isn't a caller language", async () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("sr-Latn-RS");
    setup(defaultGreeting("Clinic"));
    const select = (await screen.findByLabelText("greeting.language")) as HTMLSelectElement;
    await waitFor(() => expect((screen.getByLabelText("greeting.label") as HTMLTextAreaElement).value).toBe(defaultGreeting("Clinic")));
    expect(select.value).toBe("en");
  });

  it("keeps a greeting the owner wrote earlier when the language changes", async () => {
    setup("Welcome to Clinic!");
    const textarea = (await screen.findByLabelText("greeting.label")) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe("Welcome to Clinic!"));
    await userEvent.selectOptions(screen.getByLabelText("greeting.language"), "fr");
    expect(textarea.value).toBe("Welcome to Clinic!");
  });

  it("keeps what the owner typed when the language changes", async () => {
    vi.spyOn(navigator, "language", "get").mockReturnValue("en-US");
    setup(defaultGreeting("Clinic"));
    const textarea = (await screen.findByLabelText("greeting.label")) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe(defaultGreeting("Clinic")));
    await userEvent.type(textarea, " Hi.");
    await userEvent.selectOptions(screen.getByLabelText("greeting.language"), "it");
    expect(textarea.value).toBe(`${defaultGreeting("Clinic")} Hi.`);
  });
});
