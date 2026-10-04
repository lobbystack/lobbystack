import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Writes pretty JSON readable only by the owner. Refuses to overwrite an existing file. */
export async function writePrivateJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  await chmod(filePath, 0o600);
}
