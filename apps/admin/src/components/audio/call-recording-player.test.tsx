// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CallRecordingPlayer } from "./call-recording-player";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("never plays a recording whose download finishes after the operator picked another call", async () => {
  const decodes: Array<(buffer: { numberOfChannels: number }) => void> = [];
  vi.stubGlobal("AudioContext", class {
    decodeAudioData() { return new Promise((resolve) => decodes.push(resolve)); }
    close() { return Promise.resolve(); }
  });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new ArrayBuffer(8))));
  const played: string[] = [];
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    played.push(this.src);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const props = { autoPlay: true, downloadLabel: "Download", pauseLabel: "Pause", playLabel: "Play", variant: "hidden" as const };

  const view = render(<CallRecordingPlayer {...props} src="https://recordings.test/a.wav" />);
  await vi.waitFor(() => expect(decodes).toHaveLength(1));
  view.rerender(<CallRecordingPlayer {...props} src="https://recordings.test/b.wav" />);
  await vi.waitFor(() => expect(decodes).toHaveLength(2));

  await act(async () => decodes[1]!({ numberOfChannels: 1 }));
  await act(async () => decodes[0]!({ numberOfChannels: 1 }));

  expect(played).toEqual(["https://recordings.test/b.wav"]);
});

function stubDecode(buffer: unknown | Error) {
  vi.stubGlobal("AudioContext", class {
    decodeAudioData() { return buffer instanceof Error ? Promise.reject(buffer) : Promise.resolve(buffer); }
    close() { return Promise.resolve(); }
  });
  const fetchRecording = vi.fn(async () => new Response(new ArrayBuffer(8)));
  vi.stubGlobal("fetch", fetchRecording);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  return { fetchRecording };
}

const waveformProps = { downloadLabel: "Download", initialDurationSeconds: 60, pauseLabel: "Pause", playLabel: "Play", seekLabel: "Seek in recording", src: "https://recordings.test/a.wav", waveform: true };

it("draws flat bars and keeps the seek control until the recording is decoded", async () => {
  const { fetchRecording } = stubDecode({ getChannelData: () => new Float32Array(1200).fill(0.5), length: 1200, numberOfChannels: 1 });
  const { getByRole } = render(<CallRecordingPlayer {...waveformProps} />);

  const seek = getByRole("slider", { name: "Seek in recording" });
  const bars = [...seek.querySelectorAll("span")];
  expect(bars).toHaveLength(120);
  expect(parseFloat(bars[0]!.style.height)).toBeCloseTo(15, 3);
  expect(fetchRecording).not.toHaveBeenCalled();
});

it("loads the recording on the first play", async () => {
  const { fetchRecording } = stubDecode({ getChannelData: () => new Float32Array(1200).fill(0.5), length: 1200, numberOfChannels: 1 });
  const { getByRole } = render(<CallRecordingPlayer {...waveformProps} />);

  await act(async () => { getByRole("button", { name: "Play" }).click(); });
  await vi.waitFor(() => expect(fetchRecording).toHaveBeenCalledTimes(1));
});

it("draws the loudness of the recording as bars once it is decoded", async () => {
  const samples = new Float32Array(1200).fill(0.1);
  samples.fill(1, 0, 600);
  stubDecode({ getChannelData: () => samples, length: samples.length, numberOfChannels: 1 });
  const { getByRole } = render(<CallRecordingPlayer {...waveformProps} />);
  const seek = getByRole("slider", { name: "Seek in recording" });

  await act(async () => { getByRole("button", { name: "Play" }).click(); });
  await vi.waitFor(() => expect(seek.querySelectorAll("span")[0]!.style.height).toBe("100%"));
  const bars = [...seek.querySelectorAll("span")];
  expect(bars).toHaveLength(120);
  expect(parseFloat(bars[119]!.style.height)).toBeCloseTo(10, 3);
});

it("seeks from the keyboard on the waveform, loading the recording if needed", async () => {
  const { fetchRecording } = stubDecode({ getChannelData: () => new Float32Array(1200).fill(0.5), length: 1200, numberOfChannels: 1 });
  const { findByRole } = render(<CallRecordingPlayer {...waveformProps} />);
  const seek = await findByRole("slider", { name: "Seek in recording" });
  await vi.waitFor(() => expect(seek.getAttribute("aria-valuemax")).toBe("60"));
  await act(async () => { seek.focus(); seek.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" })); });
  await vi.waitFor(() => expect(seek.getAttribute("aria-valuenow")).toBe("5"));
  expect(fetchRecording).toHaveBeenCalledTimes(1);
});

it("falls back to the slider when the recording can't be decoded", async () => {
  stubDecode(new Error("bad audio"));
  const { container, getByRole, queryByRole } = render(<CallRecordingPlayer {...waveformProps} />);
  await act(async () => { getByRole("button", { name: "Play" }).click(); });
  await vi.waitFor(() => expect(container.querySelector("[data-slot='slider']")).not.toBeNull());
  expect(queryByRole("slider", { name: "Seek in recording" })).toBeNull();
});

describe("space bar on the waveform player", () => {
  async function ready() {
    stubDecode({ getChannelData: () => new Float32Array(1200).fill(0.5), length: 1200, numberOfChannels: 1 });
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
    const view = render(<><input aria-label="Notes" /><CallRecordingPlayer {...waveformProps} /></>);
    const seek = await view.findByRole("slider", { name: "Seek in recording" });
    await vi.waitFor(() => expect(seek.getAttribute("aria-valuemax")).toBe("60"));
    return { play, seek, view };
  }
  const press = (target: Element | Document) => target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: " " }));

  it("plays and pauses while the waveform has focus", async () => {
    const { play, seek } = await ready();
    await act(async () => { seek.focus(); press(seek); });
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("leaves the space bar to the page when focus is outside the player", async () => {
    const { play } = await ready();
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: " " });
    await act(async () => { document.body.dispatchEvent(event); });
    expect(play).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves the space bar to a text field and to buttons", async () => {
    const { play, view } = await ready();
    await act(async () => { press(view.getByLabelText("Notes")); press(view.getByRole("button", { name: "Play" })); });
    expect(play).not.toHaveBeenCalled();
  });
});
