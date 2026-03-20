import { describe, expect, it } from "vitest";

import { buildStereoCallRecording } from "./wav";

function payloadForByte(value: number): string {
  return Buffer.from([value]).toString("base64");
}

describe("buildStereoCallRecording", () => {
  it("keeps inbound and outbound audio isolated on separate channels", () => {
    const recording = buildStereoCallRecording({
      inboundChunks: [
        {
          offsetMs: 0,
          payload: payloadForByte(0x80),
        },
      ],
      outboundChunks: [
        {
          offsetMs: 0,
          payload: payloadForByte(0x00),
        },
      ],
    });

    const leftSample = recording.readInt16LE(44);
    const rightSample = recording.readInt16LE(46);

    expect(leftSample).toBe(32124);
    expect(rightSample).toBe(-32124);
  });
});
