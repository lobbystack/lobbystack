import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const STUB = "/* LobbyStack widget loader is unavailable. Run `pnpm --filter @lobbystack/embed build`. */";

function candidatePaths(): string[] {
  const cwd = process.cwd();
  return [
    path.join(cwd, "public", "embed", "embed.js"),
    path.join(cwd, "packages", "embed", "dist", "embed.js"),
    path.join(cwd, "..", "..", "packages", "embed", "dist", "embed.js"),
    path.join(cwd, "..", "packages", "embed", "dist", "embed.js"),
    path.join(cwd, ".next", "standalone", "apps", "admin", "public", "embed", "embed.js"),
  ];
}

export async function GET() {
  for (const file of candidatePaths()) {
    try {
      const body = await readFile(file);
      return new Response(body, {
        headers: {
          "content-type": "application/javascript; charset=utf-8",
          "cache-control": "public, max-age=600",
          "x-content-type-options": "nosniff",
        },
      });
    } catch {
      // Try the next candidate location.
    }
  }
  return new Response(STUB, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=60",
      "x-content-type-options": "nosniff",
    },
  });
}
