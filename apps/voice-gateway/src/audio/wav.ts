import { decodeMuLawPayload } from "./mulaw";

export type TimedAudioChunk = {
  offsetMs: number;
  payload: string;
};

function writeWavHeader(input: {
  dataLength: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
}): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = input.sampleRate * input.channels * (input.bitsPerSample / 8);
  const blockAlign = input.channels * (input.bitsPerSample / 8);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + input.dataLength, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(input.channels, 22);
  header.writeUInt32LE(input.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(input.bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(input.dataLength, 40);

  return header;
}

function totalSamplesForChunks(chunks: Array<TimedAudioChunk>, sampleRate: number): number {
  let maxSamples = 0;
  for (const chunk of chunks) {
    const samples = decodeMuLawPayload(chunk.payload);
    const startSample = Math.max(0, Math.floor((chunk.offsetMs * sampleRate) / 1000));
    maxSamples = Math.max(maxSamples, startSample + samples.length);
  }
  return maxSamples;
}

export function buildStereoCallRecording(input: {
  inboundChunks: Array<TimedAudioChunk>;
  outboundChunks: Array<TimedAudioChunk>;
  sampleRate?: number;
}): Buffer {
  const sampleRate = input.sampleRate ?? 8000;
  const totalSamples = Math.max(
    totalSamplesForChunks(input.inboundChunks, sampleRate),
    totalSamplesForChunks(input.outboundChunks, sampleRate),
    1,
  );
  const channelCount = 2;
  const data = Buffer.alloc(totalSamples * channelCount * 2);
  const mixedSamples = new Int32Array(totalSamples);

  const mixChunks = (chunks: Array<TimedAudioChunk>): void => {
    for (const chunk of chunks) {
      const samples = decodeMuLawPayload(chunk.payload);
      const startSample = Math.max(0, Math.floor((chunk.offsetMs * sampleRate) / 1000));

      for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
        const frameIndex = startSample + sampleIndex;
        if (frameIndex >= totalSamples) {
          break;
        }
        mixedSamples[frameIndex] =
          (mixedSamples[frameIndex] ?? 0) + (samples[sampleIndex] ?? 0);
      }
    }
  };

  mixChunks(input.inboundChunks);
  mixChunks(input.outboundChunks);

  for (let frameIndex = 0; frameIndex < totalSamples; frameIndex += 1) {
    const mixedSample = Math.max(-32768, Math.min(32767, mixedSamples[frameIndex] ?? 0));
    const leftOffset = frameIndex * channelCount * 2;
    const rightOffset = leftOffset + 2;
    data.writeInt16LE(mixedSample, leftOffset);
    data.writeInt16LE(mixedSample, rightOffset);
  }

  return Buffer.concat([
    writeWavHeader({
      dataLength: data.length,
      channels: channelCount,
      sampleRate,
      bitsPerSample: 16,
    }),
    data,
  ]);
}
