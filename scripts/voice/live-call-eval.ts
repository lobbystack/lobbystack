// Plays scripted callers to GPT-Live and reports how each call ended. Every run
// opens a GPT-Live session over a WebSocket and drives it with the production
// call controller, receptionist agent and caller check, so it tests the code
// that runs on calls. Agent tools that need the database fail, as they would
// with the database down. See docs/voice/testing.md.
//
// OPENAI_API_KEY=... pnpm voice:eval [--scenario <name>]... [--runs <n>] [--concurrency <n>] [--snapshot <file.json>]

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { buildPhoneSessionConfig, callerIsDone, createAgentModel, createReceptionistAgent, LiveCallController, liveDelegationEnvironment, type CallControl, type LiveCallSummary } from "@lobbystack/agent-core";
import { demoSnapshot, type BusinessContextSnapshot } from "@lobbystack/shared";
import OpenAI from "openai";
import type { SidebandWS } from "openai/resources/live/sideband/ws";
import { LiveWS } from "openai/resources/live/ws";

import { findScenarios, OPENING, type CallScenario } from "./scenarios";

const RATE = 24_000;
const CHUNK_MS = 100;
const CHUNK_BYTES = (RATE * 2 * CHUNK_MS) / 1000;
// How long a run waits after the caller's last line for the receptionist to hang up.
const END_WINDOW_MS = 15_000;
// The receptionist has answered once it has been quiet this long after speaking.
const REPLY_QUIET_MS = 1_500;
// How long the caller waits for a greeting before speaking: long enough for the worker's fallback and both retries.
const GREETING_WAIT_MS = 15_000;
// For the report only: the product never matches words to end a call.
const GOODBYE = /\b(bye|goodbye|take care|have a (good|great|nice|wonderful)|thanks for calling)\b/i;

const { values } = parseArgs({
  options: {
    scenario: { type: "string", multiple: true, default: [] },
    runs: { type: "string", default: "3" },
    concurrency: { type: "string", default: "4" },
    snapshot: { type: "string" },
  },
});
if (!process.env.OPENAI_API_KEY) throw new Error("Set OPENAI_API_KEY.");
const scenarios = findScenarios(values.scenario);
const snapshot: BusinessContextSnapshot = values.snapshot ? JSON.parse(readFileSync(values.snapshot, "utf8")) : demoSnapshot;
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = createAgentModel(liveDelegationEnvironment());
if (!model) throw new Error("No delegation model: set OPENAI_API_KEY or the AI_CHAT_* variables.");

// μ-law, as on a phone line.
function mulaw(sample: number): number {
  const sign = sample < 0 ? 0x80 : 0;
  const magnitude = Math.min(Math.abs(sample), 32_635) + 0x84;
  let exponent = 7;
  while (exponent > 0 && !(magnitude & (0x4000 >> (7 - exponent)))) exponent -= 1;
  return ~(sign | (exponent << 4) | ((magnitude >> (exponent + 3)) & 0x0f)) & 0xff;
}
function unmulaw(byte: number): number {
  const value = ~byte & 0xff;
  const magnitude = ((((value & 0x0f) << 3) + 0x84) << ((value & 0x70) >> 4)) - 0x84;
  return value & 0x80 ? -magnitude : magnitude;
}

// Caller audio goes through 8 kHz μ-law, like a phone call. GPT-Live handed
// calls over less often on phone audio than on full-band audio.
function phoneLine(pcm: Buffer): Buffer {
  const narrow: number[] = [];
  for (let index = 0; index + 6 <= pcm.length; index += 6) {
    narrow.push(unmulaw(mulaw((pcm.readInt16LE(index) + pcm.readInt16LE(index + 2) + pcm.readInt16LE(index + 4)) / 3)));
  }
  const out = Buffer.alloc(narrow.length * 6);
  narrow.forEach((sample, index) => {
    const next = narrow[index + 1] ?? sample;
    for (let step = 0; step < 3; step += 1) out.writeInt16LE(Math.round(sample + ((next - sample) * step) / 3), (index * 3 + step) * 2);
  });
  return out;
}

async function speak(text: string): Promise<Buffer> {
  const response = await client.audio.speech.create({ model: "gpt-4o-mini-tts", voice: "alloy", input: text, response_format: "pcm" });
  return phoneLine(Buffer.from(await response.arrayBuffer()));
}

type RunResult = { scenario: CallScenario; passed: boolean; greetedAfterMs?: number; greetingCommands: number; ended: boolean; endedAfterMs?: number; handOvers: string[]; checks: boolean[]; goodbyes: number; replies: string[]; error?: string };

async function run(scenario: CallScenario, audio: Map<string, Buffer>, agentModel: NonNullable<typeof model>): Promise<RunResult> {
  const ws = new LiveWS(client);
  let sessionMs = 0;
  let queue = Buffer.alloc(0);
  let lastReplyEndMs = -1;
  let replied = false;
  let scenarioStartMs = Number.POSITIVE_INFINITY;
  // When the receptionist first spoke, if it did before the caller.
  let greetedAfterMs: number | undefined;
  let greetingCommands = 0;
  let callerSpoke = false;
  let reply = "";
  let replyEndMs = -1;
  const replies: string[] = [];
  const checks: boolean[] = [];
  // Each hand-over after the opening question, by the tools the agent used.
  const handOvers: string[] = [];

  const flushReply = () => {
    if (reply.trim()) replies.push(reply.trim());
    reply = "";
  };
  ws.on("session.output_transcript.delta", (event) => {
    lastReplyEndMs = Math.max(lastReplyEndMs, event.end_ms);
    replied = true;
    if (!callerSpoke && greetedAfterMs === undefined && event.delta.trim()) greetedAfterMs = sessionMs;
    if (event.start_ms < scenarioStartMs) return;
    if (replyEndMs >= 0 && event.start_ms - replyEndMs > 700) flushReply();
    reply += event.delta;
    replyEndMs = event.end_ms;
  });

  let controller!: LiveCallController;
  // As the worker's call control does: a caller who is done can still say more first.
  const callControl: CallControl = {
    hangup: async (reason) => {
      if (reason === "caller_finished") controller.endWhenCallerDone();
      else controller.endAfterGoodbye();
    },
  };
  const agent = createReceptionistAgent({
    model: agentModel,
    context: { domain: { db: {} as never }, snapshot, channel: "voice", callId: "eval", callControl },
    directToolAnswers: true,
  });
  const closed = new Promise<LiveCallSummary>((resolve) => {
    controller = new LiveCallController({
      client,
      sessionId: `eval_${scenario.name}`,
      phone: false,
      setup: { agent, greeting: snapshot.greeting, callerDone: async (conversation, abortSignal) => { const done = await callerIsDone(agentModel, conversation, abortSignal); checks.push(done); return done; } },
      connect: () => ws as unknown as SidebandWS,
      onDelegation: (timing) => { if (timing.offsetMs >= scenarioStartMs) handOvers.push(timing.tools.join("+") || "reply"); },
      onGreeting: (event) => { if (event.step === "sent") greetingCommands += 1; },
      onClose: resolve,
    });
  });
  const closedAt = closed.then(() => sessionMs);
  controller.start();

  const started = new Promise<void>((resolve, reject) => {
    ws.on("session.started", () => resolve());
    ws.on("error", (error) => reject(new Error(error.error?.error.message ?? error.message)));
  });
  // The phone call's session, with WebSocket audio instead of SIP.
  const { type: _type, store: _store, ...session } = buildPhoneSessionConfig(snapshot);
  ws.send({ type: "session.start", session: { ...session, audio: { ...session.audio, format: { type: "audio/pcm", rate: RATE } } } as never });

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const play = async (text: string) => {
    const clip = audio.get(text)!;
    queue = Buffer.concat([queue, clip]);
    await sleep((clip.length / (RATE * 2)) * 1000);
  };
  const waitForReply = async (maxMs: number) => {
    replied = false;
    const from = sessionMs;
    while (sessionMs - from < maxMs && !(replied && sessionMs - lastReplyEndMs >= REPLY_QUIET_MS)) await sleep(CHUNK_MS);
  };
  let pump: ReturnType<typeof setInterval> | undefined;
  try {
    await Promise.race([started, sleep(15_000).then(() => { throw new Error("GPT-Live didn't start the session."); })]);
    // GPT-Live expects audio all the time, so the caller's silence is sent too.
    pump = setInterval(() => {
      const chunk = Buffer.alloc(CHUNK_BYTES);
      queue.copy(chunk, 0, 0, Math.min(CHUNK_BYTES, queue.length));
      queue = queue.subarray(Math.min(CHUNK_BYTES, queue.length));
      ws.send({ type: "session.input_audio.append", audio: chunk.toString("base64") });
      sessionMs += CHUNK_MS;
    }, CHUNK_MS);
    await waitForReply(GREETING_WAIT_MS);
    callerSpoke = true;
    await play(OPENING);
    await waitForReply(20_000);
    scenarioStartMs = sessionMs;
    for (const [index, line] of scenario.lines.entries()) {
      if (index > 0) await sleep(line.pauseMs ?? 0);
      await play(line.text);
    }
    const lastLineAt = sessionMs;
    const ended = await Promise.race([closedAt.then((at) => at), sleep(END_WINDOW_MS).then(() => undefined)]);
    flushReply();
    if (ended === undefined) {
      ws.send({ type: "session.close" });
      await Promise.race([closed, sleep(5_000)]);
    }
    const goodbyes = replies.filter((line) => GOODBYE.test(line)).length;
    const endedAfterMs = ended === undefined ? undefined : Math.max(0, ended - lastLineAt);
    const passed = scenario.expect === "ends" ? ended !== undefined : ended === undefined;
    return { scenario, passed, ...(greetedAfterMs !== undefined ? { greetedAfterMs } : {}), greetingCommands, ended: ended !== undefined, ...(endedAfterMs !== undefined ? { endedAfterMs } : {}), handOvers, checks, goodbyes, replies };
  } catch (error) {
    return { scenario, passed: false, ...(greetedAfterMs !== undefined ? { greetedAfterMs } : {}), greetingCommands, ended: false, handOvers, checks, goodbyes: 0, replies, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearInterval(pump);
    setTimeout(() => ws.close(), 1_000);
  }
}

const audio = new Map<string, Buffer>();
for (const text of new Set([OPENING, ...scenarios.flatMap((scenario) => scenario.lines.map((line) => line.text))])) audio.set(text, await speak(text));

const jobs = Array.from({ length: Number(values.runs) }, () => scenarios).flat();
const results: RunResult[] = [];
let next = 0;
await Promise.all(Array.from({ length: Math.min(Number(values.concurrency), jobs.length) }, async () => {
  while (next < jobs.length) {
    const result = await run(jobs[next++]!, audio, model);
    results.push(result);
    const greeting = `${result.greetedAfterMs === undefined ? "no greeting in 15 s" : `greeted at ${(result.greetedAfterMs / 1000).toFixed(1)} s`}${result.greetingCommands ? ` after ${result.greetingCommands} command${result.greetingCommands > 1 ? "s" : ""}` : ""}`;
    const outcome = result.error ? `error: ${result.error}` : result.ended ? `ended ${((result.endedAfterMs ?? 0) / 1000).toFixed(1)} s after the caller` : "still open";
    console.log(`${result.passed ? "PASS" : "FAIL"} ${result.scenario.name.padEnd(17)} ${greeting} | ${outcome} | hand-overs: ${result.handOvers.join(", ") || "none"} | checks: ${result.checks.map((done) => (done ? "done" : "continue")).join(", ") || "none"} | goodbyes: ${result.goodbyes} | receptionist: ${result.replies.map((line) => `"${line}"`).join(" / ")}`);
  }
}));

console.log("");
for (const scenario of scenarios) {
  const rows = results.filter((row) => row.scenario === scenario);
  console.log(`${scenario.name.padEnd(17)} expect ${scenario.expect.padEnd(9)} passed ${rows.filter((row) => row.passed).length}/${rows.length}, greeted ${rows.filter((row) => row.greetedAfterMs !== undefined).length}/${rows.length}, one goodbye ${rows.filter((row) => row.goodbyes === 1).length}/${rows.length}`);
}
process.exit(results.every((row) => row.passed) ? 0 : 1);
