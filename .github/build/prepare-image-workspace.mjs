import { readFileSync, writeFileSync } from "node:fs";

// Run only in an image build. Keep developer tooling in the checkout's manifests.
const excludedTools = new Set(["next-devtools-mcp", "railway"]);
if (!process.argv.includes("--lockfile-only")) {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  for (const name of excludedTools) delete manifest.devDependencies[name];
  writeFileSync("package.json", `${JSON.stringify(manifest, null, 2)}\n`);
}

// pnpm 10's lockfile has two-space importer keys and six-space dependency keys.
// Keep resolution/snapshot records intact; fetch traverses the retained importers.
const lock = readFileSync("pnpm-lock.yaml", "utf8");
if (!lock.startsWith("lockfileVersion: '9.0'\n") || !lock.includes("\nimporters:\n")) {
  throw new Error("Review image lockfile projection for the new pnpm lockfile format.");
}
let importer;
let skip = false;
let inImporters = false;
const lines = [];
for (const line of lock.split("\n")) {
  if (/^\S/.test(line)) {
    inImporters = line === "importers:";
    skip = false;
  }
  if (inImporters) {
    const key = /^  ([^ ].*):$/.exec(line);
    if (key) {
      importer = key[1];
      skip = importer === "mintlify";
    }
    if (importer === ".") {
      const dependency = /^      ([^ ].*):$/.exec(line);
      if (dependency) skip = excludedTools.has(dependency[1].replace(/^['"]|['"]$/g, ""));
      else if (/^    \S/.test(line)) skip = false;
    }
  }
  if (!skip) lines.push(line);
}
writeFileSync("pnpm-lock.yaml", lines.join("\n"));
const workspace = readFileSync("pnpm-workspace.yaml", "utf8");
writeFileSync("pnpm-workspace.yaml", workspace.replace(/^  - mintlify\n/m, ""));
