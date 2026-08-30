import { existsSync } from "node:fs";
import { dirname, isAbsolute, parse, resolve } from "node:path";

import { LocalStorageProvider } from "./local";
import { S3StorageProvider } from "./s3";

export type RuntimeStorageProvider = LocalStorageProvider | S3StorageProvider;

function configuredStorageProvider(source: NodeJS.ProcessEnv): "local" | "s3" | string {
  if (source.STORAGE_PROVIDER) return source.STORAGE_PROVIDER;
  if (source.S3_ENDPOINT || source.S3_BUCKET || source.S3_REGION || source.S3_ACCESS_KEY_ID || source.S3_SECRET_ACCESS_KEY) return "s3";
  return "local";
}

function localStorageRoot(configuredPath: string): string {
  if (isAbsolute(configuredPath)) return configuredPath;
  let directory = process.cwd();
  while (true) {
    if (existsSync(resolve(directory, "pnpm-workspace.yaml"))) return resolve(/* turbopackIgnore: true */ directory, configuredPath);
    const parent = dirname(directory);
    if (parent === directory || directory === parse(directory).root) return resolve(/* turbopackIgnore: true */ process.cwd(), configuredPath);
    directory = parent;
  }
}

export function createStorageProvider(source: NodeJS.ProcessEnv = process.env): RuntimeStorageProvider {
  const provider = configuredStorageProvider(source);
  if (provider === "local") {
    return new LocalStorageProvider({
      rootPath: localStorageRoot(source.LOCAL_STORAGE_PATH ?? ".lobbystack/storage"),
      publicBaseUrl: source.APP_BASE_URL ?? "http://localhost:3000",
      signingSecret: source.LOCAL_STORAGE_SIGNING_SECRET ?? source.INTERNAL_SERVICE_SECRET ?? "",
    });
  }
  if (provider === "s3") {
    const accessKeyId = source.S3_ACCESS_KEY_ID;
    const secretAccessKey = source.S3_SECRET_ACCESS_KEY;
    if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
      throw new Error("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together.");
    }
    return new S3StorageProvider({
      bucket: source.S3_BUCKET || "lobbystack",
      region: source.S3_REGION || "us-east-1",
      ...(source.S3_ENDPOINT ? { endpoint: source.S3_ENDPOINT } : {}),
      ...(accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : {}),
      forcePathStyle: source.S3_FORCE_PATH_STYLE === "true",
    });
  }
  throw new Error(`Unsupported STORAGE_PROVIDER: ${provider}. Expected local or s3.`);
}
