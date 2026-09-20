import { createStorageProvider, type RuntimeStorageProvider } from "@lobbystack/providers/storage/provider";

let storageProvider: RuntimeStorageProvider | undefined;
let storageConfiguration = "";

function configurationKey(source: NodeJS.ProcessEnv): string {
  return [
    source.STORAGE_PROVIDER,
    source.LOCAL_STORAGE_PATH,
    source.LOCAL_STORAGE_SIGNING_SECRET,
    source.INTERNAL_SERVICE_SECRET,
    source.APP_BASE_URL,
    source.S3_ACCESS_KEY_ID,
    source.S3_SECRET_ACCESS_KEY,
    source.S3_BUCKET,
    source.S3_ENDPOINT,
    source.S3_FORCE_PATH_STYLE,
    source.S3_REGION,
  ].join("\u0000");
}

/** Reuse SDK clients and their connection pools for the lifetime of a config. */
export function getStorageProvider(source: NodeJS.ProcessEnv = process.env): RuntimeStorageProvider {
  const configuration = configurationKey(source);
  if (!storageProvider || configuration !== storageConfiguration) {
    storageProvider = createStorageProvider(source);
    storageConfiguration = configuration;
  }
  return storageProvider;
}
