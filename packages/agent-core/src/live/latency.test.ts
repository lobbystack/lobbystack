import { describe, expect, it } from "vitest";

import { LiveLatencyTracker } from "./latency";

describe("LiveLatencyTracker", () => {
  it("measures the greeting and the silence before each answer from reflected audio", () => {
    const tracker = new LiveLatencyTracker();
    tracker.receptionistAudio(900, 1_000);
    tracker.receptionistAudio(1_000, 2_400);
    tracker.receptionistTranscript(950, 2_300);
    tracker.callerTranscript(3_000, 3_500);
    tracker.callerTranscript(3_520, 4_000);
    tracker.receptionistAudio(4_650, 6_000);
    tracker.callerTranscript(7_000, 8_000);
    tracker.receptionistAudio(9_200, 10_000);

    expect(tracker.summarize()).toEqual({ firstSpeechMs: 900, greetedFirst: true, answerGapsMs: [650, 1_200], speechSource: "audio" });
  });

  it("falls back to the receptionist's transcript when no audio is reflected", () => {
    const tracker = new LiveLatencyTracker();
    tracker.callerTranscript(500, 1_500);
    tracker.receptionistTranscript(2_300, 3_000);

    expect(tracker.summarize()).toEqual({ firstSpeechMs: 2_300, greetedFirst: false, answerGapsMs: [800], speechSource: "transcript" });
  });

  it("orders late caller transcripts by the session timeline", () => {
    const tracker = new LiveLatencyTracker();
    tracker.receptionistAudio(1_700, 3_000);
    tracker.callerTranscript(200, 1_200);

    expect(tracker.summarize().answerGapsMs).toEqual([500]);
  });

  it("skips caller speech the receptionist talked over and answers that start before the caller finishes", () => {
    const tracker = new LiveLatencyTracker();
    tracker.receptionistAudio(0, 5_000);
    tracker.callerTranscript(2_000, 2_500);
    tracker.receptionistAudio(5_300, 6_000);
    tracker.callerTranscript(6_500, 8_000);
    tracker.receptionistAudio(7_800, 9_000);

    expect(tracker.summarize().answerGapsMs).toEqual([]);
  });

  it("reports nothing for a call where the receptionist never spoke", () => {
    const tracker = new LiveLatencyTracker();
    tracker.callerTranscript(100, 900);

    expect(tracker.summarize()).toEqual({ greetedFirst: false, answerGapsMs: [], speechSource: "none" });
  });
});
