import { expect, it } from "vitest";
import { createFrameBudget, MAX_SESSION_FRAMES } from "./safety";

it("allows a supported 30-minute PCM16 stream with one audio and transcript event per 20ms", () => {
  const consume = createFrameBudget();
  const audio = Buffer.from(JSON.stringify({ type: "response.output_audio.delta", delta: Buffer.alloc(24_000 * 2 * 0.02).toString("base64") }));
  const transcript = Buffer.from(JSON.stringify({ type: "response.output_audio_transcript.delta", delta: "hello" }));
  expect(() => {
    for (let index = 0; index < 30 * 60 * 50; index++) { consume(audio); consume(transcript); }
  }).not.toThrow();
});

it("still bounds floods of small frames", () => {
  const consume = createFrameBudget();
  const frame = Buffer.from('{"type":"ignored"}');
  for (let index = 0; index < MAX_SESSION_FRAMES; index++) consume(frame);
  expect(() => consume(frame)).toThrow("frame budget");
});
