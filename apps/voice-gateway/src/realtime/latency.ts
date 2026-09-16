type Turn = { stoppedAt?: number; responseAt?: number; firstOutput: boolean };
const turns = new WeakMap<object, Turn>();

// Opt-in experiment; other environments retain the existing 700 ms behavior.
export function vadSilenceMs(env = process.env): number {
  const value = Number(env.VOICE_VAD_SILENCE_MS);
  return Number.isInteger(value) && value >= 300 && value <= 1200 ? value : 700;
}

// These are server observations, not a measurement of sound reaching the caller.
export function observeVoiceLatency(
  session: object,
  type: string | undefined,
  now = performance.now(),
): Record<string, number | string> | undefined {
  if (type === "input_audio_buffer.speech_started") {
    turns.set(session, { firstOutput: false });
    return;
  }
  const turn = turns.get(session);
  if (!turn) return;
  if (type === "input_audio_buffer.speech_stopped") turn.stoppedAt = now;
  if (type === "response.created") turn.responseAt = now;
  if (!turn.firstOutput && turn.stoppedAt !== undefined &&
    ["response.audio.delta", "response.output_audio.delta", "output_audio_buffer.started"].includes(type ?? "")) {
    turn.firstOutput = true;
    return {
      event: "voice.turn_latency",
      observation: type!,
      speechStopToOutputMs: Math.max(0, now - turn.stoppedAt),
      ...(turn.responseAt !== undefined ? { responseToOutputMs: Math.max(0, now - turn.responseAt) } : {}),
    };
  }
}
