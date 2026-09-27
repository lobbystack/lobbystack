import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Public files served with `immutable` caching and requested through
// `versionedAssetUrl`. Their cache key must change whenever their bytes change.
const VERSIONED_PUBLIC_PATHS = ["locales", "brand", "lobbystack-logo.svg"] as const;

function listFiles(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).sort().flatMap((entry) => listFiles(join(path, entry)));
}

/**
 * Hashes the versioned public assets so the `?v=` cache key follows their
 * content. A deployment-supplied version is not enough: when it stays the same
 * across deploys, browsers keep year-long cached copies of old translations.
 */
export function publicAssetVersion(publicDir: string, fallback: string): string {
  const files = VERSIONED_PUBLIC_PATHS.flatMap((path) => listFiles(join(publicDir, path)));
  if (files.length === 0) return fallback;
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(relative(publicDir, file).split(sep).join("/"));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 16);
}
