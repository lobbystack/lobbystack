const MULAW_BIAS = 0x84;

export function decodeMuLawByte(input: number): number {
  const muLaw = (~input) & 0xff;
  const sign = muLaw & 0x80;
  const exponent = (muLaw >> 4) & 0x07;
  const mantissa = muLaw & 0x0f;
  const magnitude = ((mantissa << 3) + MULAW_BIAS) << exponent;
  const pcm = sign ? MULAW_BIAS - magnitude : magnitude - MULAW_BIAS;
  return Math.max(-32768, Math.min(32767, pcm));
}

export function decodeMuLawPayload(payload: string): Int16Array {
  const bytes = Buffer.from(payload, "base64");
  const samples = new Int16Array(bytes.length);

  for (let index = 0; index < bytes.length; index += 1) {
    samples[index] = decodeMuLawByte(bytes[index] ?? 0);
  }

  return samples;
}
