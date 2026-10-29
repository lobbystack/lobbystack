// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReceptionistVoice } from "@lobbystack/shared";

import { VoiceDialog, useVoicePreview } from "./voice-dialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ i18n: { language: "en" }, t: (key: string, options?: Record<string, string>) => (options ? `${key}:${Object.values(options).join("/")}` : key) }),
}));

class FakeAudio {
  static all: FakeAudio[] = [];
  /** Clips whose play() rejects, as a browser does when the file won't load. */
  static rejects = new Set<string>();
  src = "";
  paused = true;
  released = false;
  currentTime = 0;
  duration = 4;
  private listeners = new Map<string, Array<() => void>>();
  constructor(src?: string) { if (src) this.src = src; FakeAudio.all.push(this); }
  addEventListener(type: string, listener: () => void, options?: { signal?: AbortSignal }) {
    if (options?.signal?.aborted) return;
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    options?.signal?.addEventListener("abort", () => this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== listener)));
  }
  removeAttribute(name: string) { if (name === "src") this.src = ""; }
  load() { if (!this.src) this.released = true; }
  pause() { this.paused = true; }
  play() {
    if (FakeAudio.rejects.has(this.src)) return Promise.reject(new DOMException("The element has no supported sources.", "NotSupportedError"));
    this.paused = false;
    return Promise.resolve();
  }
  emit(type: string) { act(() => this.listeners.get(type)?.forEach((listener) => listener())); }
}
const playing = () => FakeAudio.all.filter((audio) => !audio.paused);


beforeEach(() => { FakeAudio.all = []; FakeAudio.rejects = new Set(); vi.stubGlobal("Audio", FakeAudio); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function Harness({ onSave, onClose = () => {} }: { onSave: (voice: ReceptionistVoice) => Promise<boolean>; onClose?: () => void }) {
  const [open, setOpen] = useState(true);
  const preview = useVoicePreview("en");
  return <>
    <button onClick={() => setOpen(true)} type="button">reopen</button>
    <VoiceDialog current="marin" onOpenChange={(next) => { setOpen(next); if (!next) onClose(); }} onSave={onSave} open={open} preview={preview} saving={false} />
  </>;
}
const row = (voice: string) => screen.getByRole("button", { name: new RegExp(`^${voice}`, "i") });
// The dialog moves focus in as it opens, so wait until the row really has it.
const focus = async (element: HTMLElement) => { await act(() => new Promise((resolve) => setTimeout(resolve, 100))); act(() => element.focus()); await waitFor(() => expect(document.activeElement).toBe(element)); };
const useButton = () => screen.getByRole("button", { name: "fields.voice.dialog.use" }) as HTMLButtonElement;

describe("VoiceDialog", () => {
  it("lists the voice in use first, then the others", () => {
    render(<Harness onSave={async () => true} />);
    const dialog = screen.getByRole("dialog", { name: "fields.voice.dialog.title" });
    const current = within(dialog).getByRole("region", { name: "fields.voice.dialog.current" });
    expect(within(current).getByText("Marin")).toBeTruthy();
    expect(within(current).getByText("fields.voice.inUse")).toBeTruthy();
    const all = within(dialog).getByRole("region", { name: "fields.voice.dialog.all" });
    expect(within(all).queryByText("Marin")).toBeNull();
    expect(within(all).getAllByRole("listitem")).toHaveLength(21);
  });

  it("plays a voice without picking it, and picks a row without playing it", async () => {
    const onSave = vi.fn(async () => true);
    render(<Harness onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "fields.voice.play:Cedar" }));
    expect(playing().map((audio) => audio.src)).toEqual(["/voice-previews/en/cedar.mp3"]);
    expect(useButton().disabled).toBe(true);
    expect(row("Cedar").getAttribute("aria-pressed")).toBe("false");

    await userEvent.click(row("Ash"));
    expect(row("Ash").getAttribute("aria-pressed")).toBe("true");
    expect(useButton().disabled).toBe(false);
    expect(FakeAudio.all.filter((audio) => audio.src === "/voice-previews/en/ash.mp3")).toHaveLength(0);
  });

  it("saves the picked voice with Use this voice, then closes", async () => {
    const onSave = vi.fn(async () => true);
    const onClose = vi.fn();
    render(<Harness onClose={onClose} onSave={onSave} />);
    await userEvent.click(row("Shimmer"));
    await userEvent.click(useButton());
    expect(onSave).toHaveBeenCalledWith("shimmer");
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the dialog open when saving fails", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} onSave={async () => false} />);
    await userEvent.click(row("Shimmer"));
    await userEvent.click(useButton());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("discards the pick on Cancel", async () => {
    const onSave = vi.fn(async () => true);
    const onClose = vi.fn();
    render(<Harness onClose={onClose} onSave={onSave} />);
    await userEvent.click(row("Shimmer"));
    await userEvent.click(screen.getByRole("button", { name: "fields.voice.dialog.cancel" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("picks the focused row with Enter and with Space", async () => {
    render(<Harness onSave={async () => true} />);
    await focus(row("Cedar"));
    await userEvent.keyboard("{Enter}");
    expect(row("Cedar").getAttribute("aria-pressed")).toBe("true");
    await focus(row("Ash"));
    await userEvent.keyboard(" ");
    expect(row("Ash").getAttribute("aria-pressed")).toBe("true");
    expect(row("Cedar").getAttribute("aria-pressed")).toBe("false");
  });

  it("stops the first preview when another starts, and shows progress only on the one playing", async () => {
    render(<Harness onSave={async () => true} />);
    await userEvent.click(screen.getByRole("button", { name: "fields.voice.play:Cedar" }));
    await userEvent.click(screen.getByRole("button", { name: "fields.voice.play:Ash" }));
    expect(playing().map((audio) => audio.src)).toEqual(["/voice-previews/en/ash.mp3"]);
    expect(screen.getAllByTestId("voice-progress")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "fields.voice.stop:Ash" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "fields.voice.play:Cedar" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "fields.voice.stop:Ash" }));
    expect(playing()).toHaveLength(0);
  });

  it("stops and releases the clip when the dialog closes", async () => {
    render(<Harness onSave={async () => true} />);
    await userEvent.click(screen.getByRole("button", { name: "fields.voice.play:Cedar" }));
    const [cedar] = FakeAudio.all;
    await userEvent.click(screen.getByRole("button", { name: "fields.voice.dialog.cancel" }));
    expect(playing()).toHaveLength(0);
    expect(cedar!.released).toBe(true);
  });

  it("loads no clip until a voice plays, then one per play", async () => {
    render(<Harness onSave={async () => true} />);
    expect(FakeAudio.all).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "fields.voice.play:Cedar" }));
    await userEvent.click(screen.getByRole("button", { name: "fields.voice.play:Ash" }));
    expect(FakeAudio.all.map((audio) => audio.released)).toEqual([true, false]);
  });

  it("hides the play button of a voice whose clip fails to load, even after the dialog reopens", async () => {
    render(<Harness onSave={async () => true} />);
    await userEvent.click(screen.getByRole("button", { name: "fields.voice.play:Ash" }));
    FakeAudio.all[0]!.emit("error");
    expect(screen.queryByRole("button", { name: "fields.voice.play:Ash" })).toBeNull();
    expect(row("Ash")).toBeTruthy();
    expect(screen.getByRole("button", { name: "fields.voice.play:Cedar" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "fields.voice.dialog.cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "reopen" }));
    expect(await screen.findByRole("button", { name: "fields.voice.play:Cedar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "fields.voice.play:Ash" })).toBeNull();
  });

  it("hides the play button of a voice whose clip won't play", async () => {
    FakeAudio.rejects.add("/voice-previews/en/cedar.mp3");
    render(<Harness onSave={async () => true} />);
    await userEvent.click(screen.getByRole("button", { name: "fields.voice.play:Cedar" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "fields.voice.play:Cedar" })).toBeNull());
    expect(screen.queryByTestId("voice-progress")).toBeNull();
  });

  it("keeps a voice's button when its clip errors after another voice started", async () => {
    render(<Harness onSave={async () => true} />);
    await userEvent.click(screen.getByRole("button", { name: "fields.voice.play:Cedar" }));
    const [cedar] = FakeAudio.all;
    await userEvent.click(screen.getByRole("button", { name: "fields.voice.play:Ash" }));
    cedar!.emit("error");
    expect(screen.getByRole("button", { name: "fields.voice.play:Cedar" })).toBeTruthy();
  });
});
