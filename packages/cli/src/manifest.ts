import { readFile, realpath } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve, sep } from "node:path";

import { apiBusinessCreateSchema, apiPhoneNumberSearchSchema, apiReceptionistUpdateSchema, apiRuleCreateSchema, apiServiceCreateSchema, weekdays } from "@lobbystack/shared";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

import { CliError } from "./errors";
import { readUploadFile, type UploadFile } from "./upload";

// The file lobbystack onboard reads: a business and everything set up for it.
// Its sections take the API's own request schemas, so the manifest takes what
// the endpoints take, and a mistake shows before anything changes.

const dayNames = new Map<string, (typeof weekdays)[number]>([...weekdays.map((day) => [day, day] as const), ...weekdays.map((day) => [day.slice(0, 3), day] as const)]);
const clock = z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/, "Use 24-hour HH:MM in quotes, such as \"08:00\".");
const hoursWindow = z.strictObject({
  day: z.string().transform((value, context) => {
    const day = dayNames.get(value.trim().toLowerCase());
    if (!day) context.addIssue({ code: "custom", message: "Use a day such as mon or monday." });
    return day ?? "monday";
  }),
  open: clock,
  close: clock,
});
const fileEntry = z.union([z.string().trim().min(1), z.strictObject({ path: z.string().trim().min(1), title: z.string().trim().min(1).max(1_000).optional(), tags: z.array(z.string().trim().min(1)).optional() })]);

/** The address the API keeps for a website: https unless it says otherwise, without a trailing slash, query or fragment. */
export function websiteKey(value: string): string {
  const trimmed = value.trim();
  try {
    // As the API reads it, a colon before a digit starts a port, as in example.com:8080, not a scheme.
    const url = new URL(/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return trimmed;
  }
}

/** The text a name is found by on a rerun. */
export const nameKey = (value: string) => value.trim().toLowerCase();

export const manifestSchema = z.strictObject({
  business: apiBusinessCreateSchema.extend({
    id: z.uuid().optional(),
    hours: z.array(hoursWindow).max(28).optional(),
  }),
  receptionist: apiReceptionistUpdateSchema.refine((receptionist) => receptionist.regenerate_summary === undefined, {
    path: ["regenerate_summary"],
    message: "It isn't a setting, so every run would write a new summary. Run lobbystack receptionist set --regenerate-summary once instead.",
  }).optional(),
  services: z.array(apiServiceCreateSchema).optional(),
  rules: z.array(apiRuleCreateSchema).optional(),
  knowledge: z.strictObject({
    websites: z.array(z.string().trim().min(1)).optional(),
    read_full_site: z.boolean().optional(),
    files: z.array(fileEntry).optional(),
    faqs: z.array(z.strictObject({ question: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(20_000) })).optional(),
    texts: z.array(z.strictObject({ title: z.string().trim().min(1).max(300), content: z.string().trim().min(1).max(20_000) })).optional(),
  }).optional(),
  plan: z.union([
    z.strictObject({ managed: z.literal(true) }),
    z.strictObject({ checkout: z.strictObject({ plan: z.enum(["starter", "pro"]), interval: z.enum(["monthly", "annual"]) }) }),
  ]).optional(),
  phone_number: apiPhoneNumberSearchSchema.omit({ limit: true, replaces: true }).optional(),
  onboarding: z.strictObject({ complete: z.boolean().optional(), skip_number: z.boolean().optional(), source: z.string().trim().min(1).max(120).optional() }).optional(),
  owner: z.strictObject({ email: z.string().trim().min(3).max(320) }).optional(),
}).superRefine((manifest, context) => {
  // A rerun finds each entry again by its name, so two entries with one name would be one.
  const unique = <T>(items: readonly T[] | undefined, key: (item: T) => string, path: (index: number) => PropertyKey[]) => {
    const seen = new Map<string, number>();
    items?.forEach((item, index) => {
      const first = seen.get(key(item));
      if (first === undefined) seen.set(key(item), index);
      else context.addIssue({ code: "custom", path: path(index), message: `It repeats entry ${first}. Give each entry its own name, or remove one.` });
    });
  };
  unique(manifest.services, (service) => nameKey(service.name), (index) => ["services", index, "name"]);
  unique(manifest.rules, (rule) => nameKey(rule.title), (index) => ["rules", index, "title"]);
  unique(manifest.knowledge?.websites, websiteKey, (index) => ["knowledge", "websites", index]);
  unique(manifest.knowledge?.faqs, (faq) => nameKey(faq.question), (index) => ["knowledge", "faqs", index, "question"]);
  unique(manifest.knowledge?.texts, (text) => nameKey(text.title), (index) => ["knowledge", "texts", index, "title"]);
});

export type Manifest = z.infer<typeof manifestSchema>;

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
