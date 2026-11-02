// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppearanceProvider, useAppearancePreference } from "./appearance-provider";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en", resolvedLanguage: "en" } }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Probe() {
  const { ready, timeFormatPreference } = useAppearancePreference();
  return <p>{`${ready ? "ready" : "waiting"}:${timeFormatPreference}`}</p>;
}

describe("appearance preference readiness", () => {
  it("is not ready in the server render, which can't see the browser's saved choice", () => {
    expect(renderToString(<AppearanceProvider><Probe /></AppearanceProvider>)).toContain("waiting:");
  });

  it("is ready after mount, with the browser's saved choice", () => {
    vi.stubGlobal("localStorage", { getItem: () => "ampm", setItem: vi.fn() });
    render(<AppearanceProvider><Probe /></AppearanceProvider>);
    expect(screen.getByText("ready:ampm")).toBeTruthy();
  });

  it("is ready after mount even when nothing is saved", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
    render(<AppearanceProvider><Probe /></AppearanceProvider>);
    expect(screen.getByText(/^ready:/)).toBeTruthy();
  });
});
