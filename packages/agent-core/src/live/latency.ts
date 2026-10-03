/**
 * Measures what the caller hears on a GPT-Live call from the session timeline
 * the sideband reports. GPT-Live sends no speech-started, speech-stopped or
 * input-committed events, so the caller's turn ends where their last
 * transcribed words end (`session.input_transcript.delta` end_ms). The
 * receptionist starts speaking at its first transcribed words
 * (`session.output_transcript.delta` start_ms). The sideband's reflected
 * output audio can't mark speech: GPT-Live is full duplex, and those events
 * cover silence too.
 *
 * All times are milliseconds on the session timeline, so network delay between
 * OpenAI and the worker does not affect them.
 */
export type LiveCallLatency = {
  /** When the receptionist first started speaking, from the start of the session. */
  firstSpeechMs?: number;
  /** The receptionist spoke before the caller did. */
  greetedFirst: boolean;
  /** For each caller turn the receptionist answered: silence between the caller's last word and the answer. */
  answerGapsMs: number[];
  /** Which sideband events marked the receptionist's speech. */
  speechSource: "transcript" | "none";
};

type Span = { start: number; end: number };

// Consecutive transcript fragments of one stretch of speech
// touch or nearly touch. A larger gap could swallow the other side's turn.
const MERGE_GAP_MS = 100;

function addSpan(spans: Span[], start: number, end: number): void {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return;
  const span = { start, end: Math.max(start, end) };
  const last = spans.at(-1);
  if (last && span.start >= last.start && span.start <= last.end + MERGE_GAP_MS) {
    last.end = Math.max(last.end, span.end);
    return;
  }
  spans.push(span);
}

export class LiveLatencyTracker {
  private readonly callerSpans: Span[] = [];
  private readonly transcriptSpans: Span[] = [];

  callerTranscript(startMs: number | undefined, endMs: number | undefined): void {
    addSpan(this.callerSpans, startMs ?? endMs ?? Number.NaN, endMs ?? Number.NaN);
  }

  receptionistTranscript(startMs: number | undefined, endMs: number | undefined): void {
    addSpan(this.transcriptSpans, startMs ?? endMs ?? Number.NaN, endMs ?? Number.NaN);
  }

  summarize(): LiveCallLatency {
    const speechSource = this.transcriptSpans.length ? "transcript" : "none";
    const byStart = (a: Span, b: Span) => a.start - b.start;
    const receptionist = [...this.transcriptSpans].sort(byStart);
    const caller = [...this.callerSpans].sort(byStart);
    const timeline = [
      ...caller.map((span) => ({ ...span, speaker: "caller" as const })),
      ...receptionist.map((span) => ({ ...span, speaker: "receptionist" as const })),
    ].sort(byStart);

    const answerGapsMs: number[] = [];
    let callerEnd: number | undefined;
    let receptionistEnd = Number.NEGATIVE_INFINITY;
    for (const span of timeline) {
      if (span.speaker === "caller") {
        callerEnd = Math.max(callerEnd ?? Number.NEGATIVE_INFINITY, span.end);
        continue;
      }
      // Skip caller speech that ended while the receptionist was still talking
      // (a backchannel or an interruption it talked over), and answers that
      // started before the caller finished.
      if (callerEnd !== undefined && callerEnd > receptionistEnd && span.start >= callerEnd) {
        answerGapsMs.push(Math.round(span.start - callerEnd));
      }
      callerEnd = undefined;
      receptionistEnd = Math.max(receptionistEnd, span.end);
    }

    const first = receptionist[0];
    return {
      ...(first ? { firstSpeechMs: Math.round(first.start) } : {}),
      greetedFirst: first !== undefined && (caller[0] === undefined || first.start <= caller[0].start),
      answerGapsMs,
      speechSource,
    };
  }
}
