import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Entry = { id: string; status: "required" | "replaced" | "excluded"; implementation?: string[]; acceptanceTests?: string[] };

async function main(): Promise<void> {
  const root = process.cwd();
  const manifest = JSON.parse(await readFile(resolve(root, "docs/validation/admin-ui-parity.json"), "utf8")) as { capabilities: Entry[] };
  const errors: string[] = [];

  for (const capability of manifest.capabilities) {
    if (capability.status === "excluded") continue;
    for (const relativePath of [...(capability.implementation ?? []), ...(capability.acceptanceTests ?? [])]) {
      try {
        await readFile(resolve(root, relativePath), "utf8");
      } catch {
        errors.push(`${capability.id}: missing evidence file ${relativePath}`);
      }
    }
    if (capability.status !== "required") continue;
    const sources = await Promise.all((capability.implementation ?? []).map(async (relativePath) => await readFile(resolve(root, relativePath), "utf8")));
    const onlyStaticSurfaces = sources.length > 0 && sources.every((source) => source.includes("PageSurface") && !/(fetch\(|useQuery\(|useMutation\(|redirect\(|export async function (GET|POST|PATCH|PUT|DELETE)|get[A-Z]|create[A-Z]|update[A-Z]|delete[A-Z])/.test(source));
    if (onlyStaticSurfaces) errors.push(`${capability.id}: required capability is represented only by a static PageSurface.`);
  }

  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(`Admin UI parity check passed: ${manifest.capabilities.filter((entry) => entry.status === "required").length} required, ${manifest.capabilities.filter((entry) => entry.status === "replaced").length} replaced, ${manifest.capabilities.filter((entry) => entry.status === "excluded").length} excluded.`);
}

void main();
