// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpeningsPicker } from "./openings-picker";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("OpeningsPicker", () => {
  it("puts the form back where it was scrolled after a time is chosen", async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.push(callback); return frames.length; });
    const slot = "2030-01-01T10:00:00.000Z";
    const view = render(<div data-testid="scroller"><OpeningsPicker date="2030-01-01" failed={false} loading={false} onDateChange={vi.fn()} onSelect={() => { scroller.scrollTop = 400; }} selected={null} timeZone="UTC" times={[slot]} today="2029-12-31" /></div>);
    const scroller = view.getByTestId("scroller");
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 900 });
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 500 });
    scroller.scrollTop = 120;
    await userEvent.click(screen.getByRole("button", { name: /10:00/ }));
    expect(scroller.scrollTop).toBe(400);
    while (frames.length) frames.shift()!(0);
    expect(scroller.scrollTop).toBe(120);
  });
});
