// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SecretReveal } from "./secret-reveal";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

afterEach(() => cleanup());

it("keeps the secret out of session replay", () => {
  render(<SecretReveal value="lsp_1a2b3c4d_secret" warning="Copy it now." />);
  expect(screen.getByTestId("secret-value").className).toContain("ph-no-capture");
});

it("shows Copied after a click and goes back to Copy after two seconds, with the button disabled meanwhile", async () => {
  vi.useFakeTimers();
  try {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    render(<SecretReveal value="lsp_1a2b3c4d_secret" warning="Copy it now." />);
    const button = screen.getByRole("button", { name: "secretReveal.copy" });
    expect(screen.queryByText("secretReveal.copied")).toBeNull();
    await act(async () => { button.click(); });
    expect(writeText).toHaveBeenCalledWith("lsp_1a2b3c4d_secret");
    expect(screen.getByText("secretReveal.copied")).toBeTruthy();
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { vi.advanceTimersByTime(1999); });
    expect(screen.getByText("secretReveal.copied")).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(screen.queryByText("secretReveal.copied")).toBeNull();
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
