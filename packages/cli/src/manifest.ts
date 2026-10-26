import { readFile, realpath } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";

import { onboardManifestSchema, type OnboardManifest } from "@lobbystack/shared";
import { parse as parseYaml } from "yaml";
import type { z } from "zod";

import { CliError } from "./errors";
import { readUploadFile, type UploadFile } from "./upload";

// The file lobbystack onboard reads, from the path given. The schema lives in
// packages/shared with the logic that applies it, which the partner console
// uses for templates as well.

export { nameKey, websiteKey } from "@lobbystack/shared";

export const manifestSchema = onboardManifestSchema;

export type Manifest = OnboardManifest;

function issuePath(path: ReadonlyArray<PropertyKey>): string {
  return path.reduce<string>((text, part) => (typeof part === "number" ? `${text}[${part}]` : text ? `${text}.${String(part)}` : String(part)), "") || "(the file)";
}

function issueMessage(issue: z.core.$ZodIssue): string {
  // YAML reads 416 or +14165550100 as a number, which a text field can't take.
  if (issue.code === "invalid_type" && issue.expected === "string" && /received number/.test(issue.message)) return `${issue.message}. Put the value in quotes, such as "416".`;
  return issue.message;
}

export async function readManifest(path: string): Promise<Manifest> {
  const text = await readFile(path, "utf8").catch((error: Error) => { throw new CliError(`Couldn't read ${path}: ${error.message}`); });
  let raw: unknown;
  try {
    raw = extname(path).toLowerCase() === ".json" ? JSON.parse(text) : parseYaml(text);
  } catch (error) {
    throw new CliError(`${basename(path)} isn't valid ${extname(path).toLowerCase() === ".json" ? "JSON" : "YAML"}: ${(error as Error).message}`);
  }
  const result = manifestSchema.safeParse(raw);
  if (!result.success) throw new CliError([`${basename(path)} needs changes:`, ...result.error.issues.map((issue) => `  ${issuePath(issue.path)}: ${issueMessage(issue)}`)].join("\n"));
  return result.data;
}

/** A document the manifest lists, read and checked. */
export type ManifestFile = UploadFile & {
  /** Its path from the manifest's folder as the manifest gives it, with forward slashes, which the state file knows it by. */
  path: string;
  title?: string | undefined;
  tags?: string[] | undefined;
};

/**
 * Reads every document the manifest lists, before anything changes. Each has
 * to be inside the manifest's folder once links are followed, so a link can't
 * make a file from elsewhere on the computer, such as a saved API key, part of
 * what the receptionist tells callers.
 */
export async function readManifestFiles(manifest: Manifest, baseDir: string): Promise<ManifestFile[]> {
  const entries = manifest.knowledge?.files ?? [];
  if (!entries.length) return [];
  const base = await realpath(baseDir);
  const files: ManifestFile[] = [];
  const reals = new Set<string>();
  for (const entry of entries) {
    const { path, title, tags } = typeof entry === "string" ? { path: entry, title: undefined, tags: undefined } : entry;
    const outside = new CliError(`${path} has to be a file inside the manifest's folder, such as ./docs/prices.pdf.`);
    const isOutside = (from: string, to: string) => {
      const inside = relative(from, to);
      return !inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside);
    };
    const resolved = resolve(baseDir, path);
    if (isAbsolute(path) || isOutside(baseDir, resolved)) throw outside;
    let real: string;
    try {
      real = await realpath(resolved);
    } catch (error) {
      throw new CliError(`Couldn't read ${path}: ${(error as Error).message}`);
    }
    // Checked again where links lead, and the type is the real file's.
    if (isOutside(base, real)) throw outside;
    if (reals.has(real)) throw new CliError(`${path} is a file the manifest already lists.`);
    reals.add(real);
    files.push({ ...(await readUploadFile(real)), path: relative(baseDir, resolved).split(sep).join("/"), title, tags });
  }
  return files;
}
