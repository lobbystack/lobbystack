#!/usr/bin/env node
// Rewrites .env to follow .env.example line for line: same order, section headers and blank lines.
// Values already in .env are kept. A key that .env lacks is added with its example value, and a
// placeholder secret is generated. A key that .env.example does not list stays: it moves to a closing
// section, so a setting you added locally survives. Any other line in .env that is not a comment or
// blank (a stray fragment) is kept in the closing section too. Comments, section headers and blank
// lines come from .env.example. --prune drops the keys and lines .env.example does not list and keeps
// every value you set. --reset starts over from .env.example: example values, new secrets, nothing local.
// The old file is saved as .env.backup-<timestamp> before .env changes; a backup is never overwritten.
import { copyFileSync, constants, existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { KEY_LINE, PLACEHOLDER_PREFIX, randomSecret, resolveExampleValue } from "./lib/env-placeholders.mjs";

const UNLISTED_HEADER = "# ==== NOT IN .env.example ====";
// A key as .env files in the wild write it: optional `export`, any identifier.
const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

// Splits .env text into assignments (with their raw lines, so `export` and multi-line quoted values
// survive) and other lines that are neither comments nor blank.
export function parseEnv(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const entries = [];
  const stray = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = ASSIGNMENT.exec(line);
    if (!match) {
      if (line.trim() !== "" && !line.trimStart().startsWith("#")) stray.push(line);
      continue;
    }
    const rawLines = [line];
    const rest = match[2].trim();
    const quote = rest[0] === '"' || rest[0] === "'" ? rest[0] : null;
    if (quote && !(rest.length > 1 && rest.endsWith(quote))) {
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trimEnd().endsWith(quote)) {
          rawLines.push(...lines.slice(i + 1, j + 1));
          i = j;
          break;
        }
      }
    }
    entries.push({ key: match[1], value: match[2], raw: rawLines.join("\n") });
  }
  return { entries, stray };
}

export function syncEnv(example, current, { prune = false, reset: resetAll = false, random = randomSecret } = {}) {
  const { entries, stray } = parseEnv(current);
  const currentByKey = new Map(entries.map((entry) => [entry.key, entry]));
  const exampleKeys = new Set();
  const secrets = new Map();
  const added = [];
  const generated = [];
  const reset = [];
  const dropLocal = prune || resetAll;
  const lines = example.replace(/\r\n/g, "\n").split("\n").map((line) => {
    const match = KEY_LINE.exec(line);
    if (!match) return line;
    const [, key, exampleValue] = match;
    exampleKeys.add(key);
    const existing = currentByKey.get(key);
    if (existing && !resetAll) {
      // Composite values added later reuse the secret this key already holds.
      if (exampleValue.startsWith(PLACEHOLDER_PREFIX) && existing.value !== "") secrets.set(exampleValue, existing.value);
      return existing.raw;
    }
    if (!existing) added.push(key);
    const resolved = resolveExampleValue(key, exampleValue, secrets, random);
    if (resolved.generated) generated.push(key);
    if (existing && existing.value !== resolved.value) reset.push(key);
    return `${key}=${resolved.value}`;
  });
  const unlisted = entries.filter((entry) => !exampleKeys.has(entry.key));
  const closing = dropLocal ? [] : [...unlisted.map((entry) => entry.raw), ...stray];
  let output = lines.join("\n");
  if (closing.length > 0) output = `${output.replace(/\n*$/, "\n")}\n${UNLISTED_HEADER}\n${closing.join("\n")}\n`;
  return { output, added, generated, reset, unlisted: unlisted.map((entry) => entry.key), stray };
}

function backupPath(target, now = new Date()) {
  return `${target}.backup-${now.toISOString().replace(/\D/g, "").slice(0, 17)}`;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const reset = args.has("--reset");
  const prune = args.has("--prune") || reset;
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const target = resolve(root, ".env");
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  const { output, added, generated, reset: resetKeys, unlisted, stray } = syncEnv(readFileSync(resolve(root, ".env.example"), "utf8"), current, { prune, reset });
  const list = (items) => `${items.length}${items.length ? `: ${items.join(", ")}` : ""}`;
  const report = () => {
    console.log(`Added ${list(added)}`);
    console.log(`Generated secrets ${list(generated)}`);
    if (reset) console.log(`Reset to the example value ${list(resetKeys)}`);
    console.log(`${prune ? "Removed, not in .env.example" : "Not in .env.example, kept at the end"} ${list(unlisted)}`);
    if (stray.length > 0) console.log(`Unrecognized lines, ${prune ? "removed" : "kept at the end"} ${stray.length}: ${stray.map((line) => JSON.stringify(line.slice(0, 40))).join(", ")}`);
  };
  if (args.has("--check")) {
    report();
    process.exit(output === current ? 0 : 1);
  }
  if (output === current) {
    console.log(".env already matches .env.example.");
    return;
  }
  let backup = null;
  if (existsSync(target)) {
    backup = backupPath(target);
    copyFileSync(target, backup, constants.COPYFILE_EXCL);
  }
  writeFileSync(target, output, { mode: 0o600 });
  report();
  if (backup) console.log(`Previous file saved as ${backup.slice(root.length + 1)}.`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main();
