import type { Readable } from "node:stream";

/** A Range header the object can't satisfy. Routes answer it with 416. */
export class InvalidByteRangeError extends Error {
  constructor() {
    super("Invalid byte range.");
    this.name = "InvalidByteRangeError";
  }
}

/** An object's bytes as a stream, with the slice a Range header asked for. */
export type OpenedObject = { body: Readable; length: number; totalLength: number; start?: number; end?: number };

/** The inclusive byte slice of a single-range `bytes=` header, or undefined without one. */
export function byteRange(range: string | undefined, length: number): { start: number; end: number } | undefined {
  if (!range) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2]) || length === 0) throw new InvalidByteRangeError();
  const startText = match[1] ?? "";
  const endText = match[2] ?? "";
  const start = startText ? Number(startText) : Math.max(0, length - Number(endText));
  const end = endText && startText ? Math.min(length - 1, Number(endText)) : length - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= length) throw new InvalidByteRangeError();
  return { start, end };
}
