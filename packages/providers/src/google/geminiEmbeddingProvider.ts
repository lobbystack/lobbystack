import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embedMany } from "ai";

const EMBEDDING_DIMENSIONS = 1_536;

export type GeminiEmbeddingConfig = {
  apiKey: string;
  model: string;
};

export function geminiEmbeddingConfigFromEnvironment(
  env: Record<string, string | undefined> = process.env,
): GeminiEmbeddingConfig | null {
  const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    model: env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
  };
}

export function normalizeEmbedding(values: number[], dimensions = EMBEDDING_DIMENSIONS): number[] {
  const vector = values.slice(0, dimensions);
  while (vector.length < dimensions) vector.push(0);
  const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

export class GeminiEmbeddingProvider {
  private readonly model;

  constructor(config: GeminiEmbeddingConfig) {
    this.model = createGoogleGenerativeAI({ apiKey: config.apiKey }).embedding(config.model);
  }

  async embed(values: string[]): Promise<number[][]> {
    if (values.length === 0) return [];
    const result = await embedMany({
      model: this.model,
      values,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "gemini-embed",
        metadata: {
          "lobbystack.provider": "google",
          "lobbystack.ai.operation": "embed",
        },
        recordInputs: false,
        recordOutputs: false,
      },
    });
    return result.embeddings.map((embedding) => normalizeEmbedding(embedding));
  }
}
