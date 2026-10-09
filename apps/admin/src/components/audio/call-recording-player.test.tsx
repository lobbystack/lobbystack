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
