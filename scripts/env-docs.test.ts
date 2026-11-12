import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const keys = (text: string) => [...text.matchAll(/^([A-Z0-9_]+)=/gm)].map((match) => match[1]!);

describe(".env.example", () => {
  const example = readFileSync(resolve(root, ".env.example"), "utf8");

  it("documents every variable in the README table, in the same order", () => {
    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    const documented = [...readme.matchAll(/^\| `([A-Z0-9_]+)` \|/gm)].map((match) => match[1]);
    expect(documented).toEqual(keys(example));
  });

  it("keeps only section headers as comments", () => {
    const comments = example.split("\n").filter((line) => line.startsWith("#"));
    expect(comments.filter((line) => !/^# ==== [A-Z0-9 .]+ ====$/.test(line))).toEqual([]);
  });
});
