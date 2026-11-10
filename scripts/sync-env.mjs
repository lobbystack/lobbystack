#!/usr/bin/env node
// Rewrites .env to follow .env.example line for line: same order, section headers and blank lines.
// Values already in .env are kept. A key that .env lacks is added with its example value, and a
// placeholder secret is generated. A key that .env.example does not list is removed, so the result
// matches the example exactly; the old file is saved as .env.backup. --keep-unlisted moves such keys
// to a closing section instead.
import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROVIDER_CREDENTIALS = new Set(["TWILIO_AUTH_TOKEN", "POLAR_WEBHOOK_SECRET"]);
const PLACEHOLDER_PREFIX = "replace-with-";
const UNLISTED_HEADER = "# ==== NOT IN .env.example ====";
const KEY_LINE = /^([A-Z0-9_]+)=(.*)$/;

function parseValues(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = KEY_LINE.exec(line);
    if (match) values.set(match[1], match[2]);
  }
  return values;
}

export function syncEnv(example, current, { keepUnlisted = false, random = () => randomBytes(32).toString("hex") } = {}) {
  const currentValues = parseValues(current);
  const exampleKeys = new Set();
  const added = [];
  const generated = [];
  const lines = example.replace(/\r\n/g, "\n").split("\n").map((line) => {
    const match = KEY_LINE.exec(line);
    if (!match) return line;
    const [, key, exampleValue] = match;
    exampleKeys.add(key);
    if (currentValues.has(key)) return `${key}=${currentValues.get(key)}`;
    added.push(key);
    if (exampleValue.startsWith(PLACEHOLDER_PREFIX)) {
      if (PROVIDER_CREDENTIALS.has(key)) return `${key}=`;
      generated.push(key);
      return `${key}=${random()}`;
    }
    return line;
  });
  const unlisted = [...currentValues.keys()].filter((key) => !exampleKeys.has(key));
  let output = lines.join("\n");
  if (unlisted.length > 0 && keepUnlisted) {
    output = `${output.replace(/\n*$/, "\n")}\n${UNLISTED_HEADER}\n${unlisted.map((key) => `${key}=${currentValues.get(key)}`).join("\n")}\n`;
  }
  return { output, added, generated, unlisted };
}

function main() {
  const args = new Set(process.argv.slice(2));
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const target = resolve(root, ".env");
  const current = existsSync(target) ? readFileSync(target, "utf8") : "";
  const { output, added, generated, unlisted } = syncEnv(readFileSync(resolve(root, ".env.example"), "utf8"), current, { keepUnlisted: args.has("--keep-unlisted") });
  const report = () => {
    console.log(`Added ${added.length}${added.length ? `: ${added.join(", ")}` : ""}`);
    console.log(`Generated secrets ${generated.length}${generated.length ? `: ${generated.join(", ")}` : ""}`);
    console.log(`${args.has("--keep-unlisted") ? "Not in .env.example, kept at the end" : "Removed, not in .env.example"} ${unlisted.length}${unlisted.length ? `: ${unlisted.join(", ")}` : ""}`);
  };
  if (args.has("--check")) {
    report();
    process.exit(output === current ? 0 : 1);
  }
  if (output === current) {
    console.log(".env already matches .env.example.");
    return;
  }
  if (existsSync(target)) copyFileSync(target, `${target}.backup`);
  writeFileSync(target, output, { mode: 0o600 });
  report();
  if (existsSync(`${target}.backup`)) console.log("Previous file saved as .env.backup.");
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) main();
