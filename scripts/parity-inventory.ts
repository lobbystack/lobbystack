import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readText(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function listFiles(directory: string): string[] {
  const absoluteDirectory = join(root, directory);
  if (!existsSync(absoluteDirectory)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
    const absolutePath = join(absoluteDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(relative(root, absolutePath)));
    } else {
      files.push(relative(root, absolutePath));
    }
  }
  return files.sort();
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function extractAll(source: string, pattern: RegExp): string[] {
  return [...source.matchAll(pattern)].flatMap((match) => (match[1] ? [match[1]] : []));
}

function appRoutePath(file: string): string {
  const segments = file.replace(/^apps\/admin\/app\//, "").split("/");
  segments.pop();
  return `/${segments
    .filter((segment) => !/^\(.+\)$/.test(segment))
    .map((segment) => segment.replace(/^\[\.\.\.(.+)\]$/, "*$1").replace(/^\[(.+)\]$/, ":$1"))
    .join("/")}`.replace(/\/\/$/, "/") || "/";
}

function convexFunctionInventory(): string[] {
  return unique(
    listFiles("convex")
      .filter((file) => file.endsWith(".ts") && !file.includes("/_generated/"))
      .flatMap((file) => {
        const source = readText(file);
        return extractAll(source, /export\s+(?:const|function|async\s+function)\s+([A-Za-z0-9_]+)/g).map(
          (name) => `${file}:${name}`,
        );
      }),
  );
}

const appSource = readText("apps/web/src/App.tsx");
const apiSource = readText("convex/_generated/api.d.ts");
const httpSource = readText("convex/http.ts");
const gatewaySource = readText("apps/voice-gateway/src/convex/runtimeClient.ts");
const schemaSource = readText("convex/schema.ts");
const adminRouteFiles = listFiles("apps/admin/app").filter((file) => /(?:page|route)\.(tsx?|mts?)$/.test(file));
const adminPageFiles = adminRouteFiles.filter((file) => file.endsWith("/page.tsx"));
const adminApiFiles = adminRouteFiles.filter((file) => file.includes("/api/") && file.endsWith("/route.ts"));
const httpRoutes = [...httpSource.matchAll(/http\.route\(\{\s*path:\s*["']([^"']+)["'],\s*method:\s*["']([^"']+)["']/g)].map(
  ([, path, method]) => `${method} ${path}`,
);
const replacementMigrations = listFiles("packages/db/migrations").filter((file) => file.endsWith(".sql"));

const inventory = {
  generatedAt: new Date().toISOString(),
  legacy: {
    appRoutes: unique(extractAll(appSource, /\bpath\s*=\s*["'`]([^"'`]+)["'`]/g)),
    convexApiModules: unique(extractAll(apiSource, /import\s+type\s+\*\s+as\s+\w+\s+from\s+["']\.\.\/(.+?)["'];/g)),
    convexFunctions: convexFunctionInventory(),
    httpRoutes: unique(httpRoutes),
    gatewayReferences: unique(extractAll(gatewaySource, /["'](\/[^"']+)["']/g)),
    schemaTables: unique(extractAll(schemaSource, /^\s{2}([a-zA-Z0-9_]+):\s+defineTable\(/gm)),
  },
  replacement: {
    adminPages: unique(adminPageFiles.map(appRoutePath)),
    adminApiRoutes: unique(adminApiFiles.map(appRoutePath)),
    migrations: replacementMigrations,
    jobTypes: unique(extractAll(readText("packages/contracts/src/index.ts").match(/export const jobTypes = \[(.*?)] as const/s)?.[1] ?? "", /\s+"([a-zA-Z0-9_.]+)",?/g)),
  },
};

console.log(JSON.stringify(inventory, null, 2));
