import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(process.cwd(), "../..");
const CONVEX_ROOT = join(REPO_ROOT, "convex");
const DISALLOWED_GENERATED_SERVER_IMPORTS = new Set([
  "action",
  "httpAction",
  "internalAction",
  "internalMutation",
  "mutation",
]);

function listSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const file = join(dir, entry);
    const stat = statSync(file);
    if (stat.isDirectory()) {
      if (entry !== "_generated") {
        files.push(...listSourceFiles(file));
      }
      continue;
    }
    if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      files.push(file);
    }
  }
  return files;
}

function importStatements(source: string): string[] {
  const statements: string[] = [];
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.trim().startsWith("import ")) {
      continue;
    }
    const statementLines = [line];
    while (
      index + 1 < lines.length &&
      !(statementLines[statementLines.length - 1] ?? "").trimEnd().endsWith(";")
    ) {
      index += 1;
      statementLines.push(lines[index] ?? "");
    }
    statements.push(statementLines.join("\n"));
  }
  return statements;
}

function importedNames(statement: string): string[] {
  const match = statement.match(/\{([\s\S]*?)\}/);
  if (!match) {
    return [];
  }
  return (match[1] ?? "")
    .split(",")
    .map((specifier) => specifier.trim())
    .filter((specifier) => specifier && !specifier.startsWith("type "))
    .map((specifier) => (specifier.split(/\s+as\s+/)[0] ?? "").trim());
}

describe("Convex observability coverage", () => {
  it("routes production write/action/http registrations through observed wrappers", () => {
    const offenders: string[] = [];

    for (const file of listSourceFiles(CONVEX_ROOT)) {
      const relativePath = relative(REPO_ROOT, file);
      if (
        relativePath === "convex/telemetry/posthog.ts" ||
        relativePath === "convex/telemetry/observedFunctions.ts"
      ) {
        continue;
      }

      const source = readFileSync(file, "utf8");
      for (const statement of importStatements(source)) {
        if (!statement.includes("_generated/server")) {
          continue;
        }
        const disallowedNames = importedNames(statement).filter((name) =>
          DISALLOWED_GENERATED_SERVER_IMPORTS.has(name),
        );
        if (disallowedNames.length > 0) {
          offenders.push(`${relativePath}: ${disallowedNames.join(", ")}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
