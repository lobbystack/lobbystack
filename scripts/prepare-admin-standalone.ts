import { cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function prepareAdminStandalone(adminRoot: string): Promise<void> {
  const destination = resolve(adminRoot, ".next/standalone/apps/admin");
  await mkdir(resolve(destination, ".next"), { recursive: true });
  // cp -R public target/public nests public/public when the widget build has
  // already created target/public/embed. Node cp merges directory contents.
  await cp(resolve(adminRoot, ".next/static"), resolve(destination, ".next/static"), { recursive: true, force: true });
  await cp(resolve(adminRoot, "public"), resolve(destination, "public"), { recursive: true, force: true });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await prepareAdminStandalone(fileURLToPath(new URL("../apps/admin", import.meta.url)));
}
