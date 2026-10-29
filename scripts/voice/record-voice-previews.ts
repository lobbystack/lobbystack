// Records the voice previews in the dashboard's voice dialog: every receptionist
// voice saying one short line in each runtime language. Each clip is a real
// GPT-Live session opened with the production phone config, so it sounds like
// the start of a call. Run it once and commit the clips; it skips files that
// already exist, and lists any clip short enough to have cut the line off.
//
// OPENAI_API_KEY=... pnpm voice:previews [--voice <name>]... [--locale <code>]... [--concurrency <n>] [--force]

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { buildPhoneSessionConfig } from "@lobbystack/agent-core";
import { demoSnapshot, isReceptionistVoice, isRuntimeLocale, receptionistVoices, runtimeLocales, type ReceptionistVoice, type RuntimeLocale } from "@lobbystack/shared";
import OpenAI from "openai";
import { LiveWS } from "openai/resources/live/ws";

const RATE = 24_000;
const CHUNK_MS = 100;
const CHUNK_BYTES = (RATE * 2 * CHUNK_MS) / 1000;
// GPT-Live sends no event when the voice finishes its turn (output audio and
// transcripts are open-ended deltas), so the clip ends on quiet. A pause
// between sentences can last over a second, so the clip ends after this much
// quiet once the transcript has the line's last word, and after the longer
// wait otherwise.
const LINE_DONE_QUIET_MS = 1_500;
const QUIET_MS = 4_000;
// A clip shorter than this probably cut the line off; the summary lists them.
const MIN_CLIP_SECONDS = 2;
// Quieter than this is silence, on a 16-bit scale.
const VOICE_RMS = 300;
const START_TIMEOUT_MS = 20_000;
const CLIP_TIMEOUT_MS = 30_000;
const OUTPUT_DIR = join(import.meta.dirname, "../../apps/admin/public/voice-previews");

// Neutral in gender where the language marks it, since every voice speaks every language.
const LINES: Record<RuntimeLocale, string> = {
  en: "Thanks for calling. How can I help you today?",
  fr: "Merci de votre appel. Comment puis-je vous aider aujourd’hui ?",
  es: "Gracias por llamar. ¿En qué puedo ayudarle hoy?",
  sr: "Hvala što ste pozvali. Kako mogu da vam pomognem danas?",
  de: "Danke für Ihren Anruf. Wie kann ich Ihnen heute helfen?",
  pt: "Agradeço a ligação. Como posso ajudar hoje?",
  it: "Grazie per la chiamata. Come posso aiutarla oggi?",
  nl: "Bedankt voor uw telefoontje. Waarmee kan ik u vandaag helpen?",
};

const { values } = parseArgs({
  options: {
    voice: { type: "string", multiple: true, default: [] },
    locale: { type: "string", multiple: true, default: [] },
    concurrency: { type: "string", default: "4" },
    force: { type: "boolean", default: false },
  },
});
if (!process.env.OPENAI_API_KEY) throw new Error("Set OPENAI_API_KEY.");
const voices = values.voice.length ? values.voice.map((voice): ReceptionistVoice => { if (!isReceptionistVoice(voice)) throw new Error(`Unknown voice ${voice}.`); return voice; }) : [...receptionistVoices];
const locales = values.locale.length ? values.locale.map((locale): RuntimeLocale => { if (!isRuntimeLocale(locale)) throw new Error(`--locale must be one of ${runtimeLocales.join(", ")}.`); return locale; }) : [...runtimeLocales];
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function rms(pcm: Buffer): number {
  const samples = Math.floor(pcm.length / 2);
  if (!samples) return 0;
  let sum = 0;
  for (let index = 0; index < samples; index += 1) sum += pcm.readInt16LE(index * 2) ** 2;
  return Math.sqrt(sum / samples);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const words = (text: string): string[] => text.normalize("NFKC").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/** Whether the transcript so far reaches the end of the line: its last word, after most of the others. */
function saidWholeLine(transcript: string, line: string): boolean {
  const said = words(transcript);
  const expected = words(line);
  return expected.length > 0 && said.includes(expected.at(-1)!) && said.length >= Math.ceil(expected.length * 0.75);
}

/** How long the voice keeps quiet before the clip ends. */
function quietLimitMs(transcript: string, line: string): number {
  return saidWholeLine(transcript, line) ? LINE_DONE_QUIET_MS : QUIET_MS;
}

/** The opening line, spoken by GPT-Live as the greeting of a call in that voice and language. Returns 24 kHz mono PCM16. */
async function record(voice: ReceptionistVoice, locale: RuntimeLocale): Promise<{ pcm: Buffer; transcript: string }> {
  const ws = new LiveWS(client);
  const chunks: Buffer[] = [];
  let lastAudioAt = 0;
  let failure: Error | undefined;
  let transcript = "";
  ws.on("session.output_transcript.delta", (event) => { transcript += event.delta; });
  // GPT-Live streams silence between sentences and after the line, so only a loud chunk counts as speech.
  ws.on("session.output_audio.delta", (event) => {
    const chunk = Buffer.from(event.delta, "base64");
    chunks.push(chunk);
    if (rms(chunk) >= VOICE_RMS) lastAudioAt = Date.now();
  });
  ws.on("error", (error) => { failure = new Error(error.error?.error.message ?? error.message); });
  const started = new Promise<void>((resolve) => ws.on("session.started", () => resolve()));
  const { type: _type, store: _store, ...session } = buildPhoneSessionConfig({ ...demoSnapshot, voice, defaultLocale: locale, greeting: LINES[locale] });
  ws.send({ type: "session.start", session: { ...session, audio: { ...session.audio, format: { type: "audio/pcm", rate: RATE } } } as never });
  // GPT-Live expects caller audio all the time, so it gets silence.
  let pump: ReturnType<typeof setInterval> | undefined;
  try {
    await Promise.race([started, sleep(START_TIMEOUT_MS).then(() => { throw failure ?? new Error("GPT-Live didn't start the session."); })]);
    pump = setInterval(() => ws.send({ type: "session.input_audio.append", audio: Buffer.alloc(CHUNK_BYTES).toString("base64") }), CHUNK_MS);
    const deadline = Date.now() + CLIP_TIMEOUT_MS;
    while (Date.now() < deadline && !failure && !(lastAudioAt && Date.now() - lastAudioAt >= quietLimitMs(transcript, LINES[locale]))) await sleep(CHUNK_MS);
    if (failure) throw failure;
    if (!lastAudioAt) throw new Error("GPT-Live didn't speak.");
    return { pcm: Buffer.concat(chunks), transcript: transcript.trim() };
  } finally {
    clearInterval(pump);
    ws.send({ type: "session.close" });
    setTimeout(() => ws.close(), 500);
  }
}

/** Trims the leading silence and encodes a small mono MP3. */
function encode(pcm: Buffer, file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "s16le", "-ar", String(RATE), "-ac", "1", "-i", "pipe:0", "-af", "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.1,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.25,areverse", "-t", "8", "-c:a", "libmp3lame", "-b:a", "32k", file]);
    let stderr = "";
    ffmpeg.stderr.on("data", (data) => { stderr += String(data); });
    ffmpeg.stdin.on("error", () => {});
    ffmpeg.on("error", reject);
    ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}: ${stderr.trim()}`))));
    ffmpeg.stdin.end(pcm);
  });
}

function duration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
    let stdout = "";
    ffprobe.stdout.on("data", (data) => { stdout += String(data); });
    ffprobe.on("error", reject);
    ffprobe.on("close", (code) => (code === 0 ? resolve(Number(stdout.trim())) : reject(new Error(`ffprobe exited with ${code} for ${file}.`))));
  });
}

const jobs = locales.flatMap((locale) => voices.map((voice) => ({ voice, locale, file: join(OUTPUT_DIR, locale, `${voice}.mp3`) }))).filter((job) => values.force || !existsSync(job.file));
await Promise.all(locales.map((locale) => mkdir(join(OUTPUT_DIR, locale), { recursive: true })));
console.log(`Recording ${jobs.length} clip${jobs.length === 1 ? "" : "s"}.`);
let next = 0;
let failed = 0;
await Promise.all(Array.from({ length: Math.min(Number(values.concurrency), jobs.length) }, async () => {
  while (next < jobs.length) {
    const job = jobs[next++]!;
    try {
      const { pcm, transcript } = await record(job.voice, job.locale);
      await encode(pcm, job.file);
      const seconds = await duration(job.file);
      console.log(`${seconds < MIN_CLIP_SECONDS ? "SHORT" : "ok   "} ${job.locale}/${job.voice} ${seconds.toFixed(1)} s "${transcript}"`);
    } catch (error) {
      failed += 1;
      console.log(`FAIL ${job.locale}/${job.voice}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}));

let bytes = 0;
let count = 0;
const short: string[] = [];
for (const locale of runtimeLocales) {
  for (const name of await readdir(join(OUTPUT_DIR, locale)).catch(() => [])) {
    const file = join(OUTPUT_DIR, locale, name);
    bytes += (await stat(file)).size;
    count += 1;
    const seconds = await duration(file);
    if (seconds < MIN_CLIP_SECONDS) short.push(`${locale}/${name} ${seconds.toFixed(1)} s`);
  }
}
console.log(`${count} clips, ${(bytes / 1024 / 1024).toFixed(2)} MB in total.`);
if (short.length) console.log(`Under ${MIN_CLIP_SECONDS} s, so check each says the whole line and re-record it with --force if not:\n  ${short.join("\n  ")}`);
process.exit(failed ? 1 : 0);
