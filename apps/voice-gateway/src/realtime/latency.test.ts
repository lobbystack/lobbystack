import { describe, expect, it } from "vitest";
import { observeVoiceLatency, vadSilenceMs } from "./latency";

describe("voice latency", () => {
  it("keeps the baseline unless a bounded experiment is configured", () => {
    expect(vadSilenceMs({})).toBe(700);
    expect(vadSilenceMs({ VOICE_VAD_SILENCE_MS: "500" })).toBe(500);
    expect(vadSilenceMs({ VOICE_VAD_SILENCE_MS: "0" })).toBe(700);
    expect(vadSilenceMs({ VOICE_VAD_SILENCE_MS: "NaN" })).toBe(700);
  });
  it("measures first output once per caller turn and isolates sessions", () => {
    const session = {};
    observeVoiceLatency(session, "input_audio_buffer.speech_started", 0);
    observeVoiceLatency(session, "input_audio_buffer.speech_stopped", 100);
    observeVoiceLatency(session, "response.created", 150);
    expect(observeVoiceLatency(session, "response.output_audio.delta", 400)).toMatchObject({ speechStopToOutputMs: 300, responseToOutputMs: 250 });
    expect(observeVoiceLatency(session, "response.output_audio.delta", 500)).toBeUndefined();
    expect(observeVoiceLatency({}, "output_audio_buffer.started", 500)).toBeUndefined();
    observeVoiceLatency(session, "input_audio_buffer.speech_started", 600);
    expect(observeVoiceLatency(session, "output_audio_buffer.started", 650)).toBeUndefined();
  });
});
