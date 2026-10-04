import { createStorageProvider, type RuntimeStorageProvider } from "@lobbystack/providers/storage/provider";

let storageProvider: RuntimeStorageProvider | undefined;

/** One provider per process, so SDK clients reuse their connection pools. */
export function getStorageProvider(): RuntimeStorageProvider {
  return storageProvider ??= createStorageProvider(process.env);
}
