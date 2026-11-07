// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

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
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new ArrayBuffer(8))));
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
}

const waveformProps = { downloadLabel: "Download", initialDurationSeconds: 60, pauseLabel: "Pause", playLabel: "Play", seekLabel: "Seek in recording", src: "https://recordings.test/a.wav", waveform: true };

it("draws the loudness of the recording as bars once it is decoded", async () => {
  const samples = new Float32Array(1200).fill(0.1);
  samples.fill(1, 0, 600);
  stubDecode({ getChannelData: () => samples, length: samples.length, numberOfChannels: 1 });
  const { findByRole } = render(<CallRecordingPlayer {...waveformProps} />);

  const seek = await findByRole("slider", { name: "Seek in recording" });
  const bars = [...seek.querySelectorAll("span")];
  expect(bars).toHaveLength(120);
  expect(bars[0]!.style.height).toBe("100%");
  expect(parseFloat(bars[119]!.style.height)).toBeCloseTo(10, 3);
});

it("seeks from the keyboard on the waveform", async () => {
  stubDecode({ getChannelData: () => new Float32Array(1200).fill(0.5), length: 1200, numberOfChannels: 1 });
  const { findByRole } = render(<CallRecordingPlayer {...waveformProps} />);
  const seek = await findByRole("slider", { name: "Seek in recording" });
  await vi.waitFor(() => expect(seek.getAttribute("aria-valuemax")).toBe("60"));
  await act(async () => { seek.focus(); seek.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" })); });
  await vi.waitFor(() => expect(seek.getAttribute("aria-valuenow")).toBe("5"));
});

it("falls back to the slider when the recording can't be decoded", async () => {
  stubDecode(new Error("bad audio"));
  const { container, queryByRole } = render(<CallRecordingPlayer {...waveformProps} />);
  await vi.waitFor(() => expect(container.querySelector("[data-slot='slider']")).not.toBeNull());
  expect(queryByRole("slider", { name: "Seek in recording" })).toBeNull();
});
