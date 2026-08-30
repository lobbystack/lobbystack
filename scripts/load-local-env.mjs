import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

export function loadLocalEnv(paths) {
  const inheritedKeys = new Set(Object.keys(process.env));

  for (const path of paths) {
    if (!existsSync(path)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(path, "utf8")))) {
      if (!inheritedKeys.has(key)) process.env[key] = value;
    }
  }
}
