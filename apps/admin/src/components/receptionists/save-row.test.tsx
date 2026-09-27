// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SaveRow } from "./receptionist-page";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en" }, t: (key: string) => key }) }));

afterEach(() => cleanup());

describe("SaveRow", () => {
  it("keeps Discard working while an invalid edit blocks Save", async () => {
    const onReset = vi.fn();
    const onSave = vi.fn();
    render(<SaveRow canSave={false} dirty onReset={onReset} onSave={onSave} saving={false} />);
    expect(screen.getByRole("button", { name: "save.save" })).toHaveProperty("disabled", true);
    const discard = screen.getByRole("button", { name: "save.discard" });
    expect(discard).toHaveProperty("disabled", false);
    await userEvent.click(discard);
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("turns both buttons off until something changes", () => {
    render(<SaveRow dirty={false} onReset={vi.fn()} onSave={vi.fn()} saving={false} />);
    expect(screen.getByRole("button", { name: "save.save" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "save.discard" })).toHaveProperty("disabled", true);
  });

  it("saves a valid change", async () => {
    const onSave = vi.fn();
    render(<SaveRow dirty onReset={vi.fn()} onSave={onSave} saving={false} />);
    await userEvent.click(screen.getByRole("button", { name: "save.save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
