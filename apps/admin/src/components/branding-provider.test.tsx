// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider, useTranslation } from "react-i18next";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createI18nInstance } from "@/i18n";
import { BRANDING_API_PATH, DEFAULT_BRANDING_SNAPSHOT, brandLogoSrc, type BrandingSnapshot } from "@/lib/branding-snapshot";
import { BrandMark } from "./brand-mark";
import { BrandingProvider, useBranding } from "./branding-provider";

const DEFAULT_ICON = brandLogoSrc(DEFAULT_BRANDING_SNAPSHOT)!;

function Probe() {
  const { t } = useTranslation("fixture");
  return <p data-testid="text">{t("skip")}</p>;
}

function renderWith(initial: BrandingSnapshot) {
  const i18n = createI18nInstance({ locale: "en", appName: initial.appName, resources: { fixture: { skip: "Skip and keep {{appName}}" } } });
  return render(
    <I18nextProvider i18n={i18n}>
      <BrandingProvider i18n={i18n} initial={initial}><BrandMark /><Probe /></BrandingProvider>
    </I18nextProvider>,
  );
}

// What the server rendered into the head, as Next.js writes it.
function renderedHead(title: string, icon: string) {
  document.title = title;
  const link = document.createElement("link");
  link.rel = "icon";
  link.href = icon;
  document.head.append(link);
  return link;
}

afterEach(() => {
  cleanup();
  document.head.innerHTML = "";
  vi.unstubAllGlobals();
});

describe("deployment branding in the page", () => {
  it("asks for the name on a prerendered page and shows it everywhere at once", async () => {
    let answer: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { answer = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    const icon = renderedHead("Sign in | LobbyStack", DEFAULT_ICON);
    renderWith({ ...DEFAULT_BRANDING_SNAPSHOT, final: false });

    // Nothing names the deployment until the server says what it's called.
    expect(screen.queryByLabelText("LobbyStack")).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(BRANDING_API_PATH, expect.objectContaining({ cache: "no-store" }));
    await act(async () => answer!(Response.json({ appName: "Acme Desk", logoUrl: "/api/branding/logo?v=abc" })));

    const mark = await screen.findByLabelText("Acme Desk");
    expect(mark.querySelector("img")?.getAttribute("src")).toBe("/api/branding/logo?v=abc");
    expect(screen.getByTestId("text").textContent).toBe("Skip and keep Acme Desk");
    await waitFor(() => expect(document.title).toBe("Sign in | Acme Desk"));
    expect(icon.getAttribute("href")).toBe("/api/branding/logo?v=abc");

    // Next.js rewrites the head on navigation; the name follows.
    document.title = "Create an account | LobbyStack";
    await waitFor(() => expect(document.title).toBe("Create an account | Acme Desk"));
  });

  it("keeps the server's branding on a page rendered with it", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    renderedHead("Calls | Acme Desk", "/api/branding/logo?v=abc");
    renderWith({ appName: "Acme Desk", logoUrl: "/api/branding/logo?v=abc", final: true });
    expect(screen.getByLabelText("Acme Desk")).toBeTruthy();
    expect(screen.getByTestId("text").textContent).toBe("Skip and keep Acme Desk");
    expect(document.title).toBe("Calls | Acme Desk");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("drops LobbyStack's mark when a name is saved without a logo", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const icon = renderedHead("Onboarding | LobbyStack", DEFAULT_ICON);
    function Save() {
      const { setBranding } = useBranding();
      return <button onClick={() => setBranding({ appName: "Acme Desk", logoUrl: null })} type="button">save</button>;
    }
    const i18n = createI18nInstance({ locale: "en" });
    render(<I18nextProvider i18n={i18n}><BrandingProvider i18n={i18n} initial={DEFAULT_BRANDING_SNAPSHOT}><BrandMark /><Save /></BrandingProvider></I18nextProvider>);
    expect(screen.getByLabelText("LobbyStack").querySelector("img")).not.toBeNull();
    await act(async () => screen.getByRole("button", { name: "save" }).click());
    expect(screen.getByLabelText("Acme Desk").querySelector("img")).toBeNull();
    await waitFor(() => expect(document.title).toBe("Onboarding | Acme Desk"));
    expect(icon.getAttribute("href")).toBe("data:,");
  });

  it("falls back to the default when the server can't say", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    renderWith({ ...DEFAULT_BRANDING_SNAPSHOT, final: false });
    expect(await screen.findByLabelText("LobbyStack")).toBeTruthy();
  });
});
