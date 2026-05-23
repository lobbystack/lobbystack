import { createRef } from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Turnstile, type TurnstileHandle } from "./turnstile";

type TurnstileRenderOptions = Parameters<
  NonNullable<typeof window.turnstile>["render"]
>[1];

function installTurnstileMock() {
  let renderOptions: TurnstileRenderOptions | null = null;
  const turnstile = {
    ready: vi.fn((callback: () => void) => callback()),
    render: vi.fn((_container: HTMLElement, options: TurnstileRenderOptions) => {
      renderOptions = options;
      return "widget-id";
    }),
    execute: vi.fn(),
    remove: vi.fn(),
    getRenderOptions: () => renderOptions,
  };

  window.turnstile = turnstile;
  return turnstile;
}

describe("Turnstile", () => {
  afterEach(() => {
    delete window.turnstile;
  });

  it("keeps widget space reserved while the challenge is mounted", async () => {
    const turnstile = installTurnstileMock();
    const rendered = render(
      <Turnstile onTokenChange={() => {}} siteKey="site-key" />,
    );
    const wrapper = rendered.container.firstElementChild as HTMLElement;

    expect(wrapper.className).toContain("min-h-[80px]");

    await waitFor(() => expect(turnstile.render).toHaveBeenCalledOnce());

    expect(turnstile.getRenderOptions()).toMatchObject({
      appearance: "always",
      execution: "render",
      "response-field": false,
      size: "flexible",
      tabindex: 0,
      theme: "auto",
    });
    expect(wrapper.className).toContain("min-h-[80px]");
    expect(wrapper.hasAttribute("inert")).toBe(false);
  });

  it("executes the rendered widget without hiding the challenge container", async () => {
    const turnstile = installTurnstileMock();
    const turnstileRef = createRef<TurnstileHandle>();
    const rendered = render(
      <Turnstile ref={turnstileRef} onTokenChange={() => {}} siteKey="site-key" />,
    );
    const wrapper = rendered.container.firstElementChild as HTMLElement;
    const widgetContainer = wrapper.firstElementChild as HTMLElement;

    await waitFor(() => expect(turnstile.render).toHaveBeenCalledOnce());

    expect(turnstileRef.current?.execute()).toBe(true);

    await waitFor(() => {
      expect(turnstile.execute).toHaveBeenCalledWith(widgetContainer);
    });
    expect(wrapper.className).toContain("min-h-[80px]");
    expect(wrapper.hasAttribute("inert")).toBe(false);
  });
});
