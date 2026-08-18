import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const STUB = "/* LobbyStack widget loader is unavailable. Run `pnpm --filter @lobbystack/embed build`. */";
const EMBED_FILE = path.join(process.cwd(), "public", "embed", "embed.js");

export async function GET() {
  try {
    const body = await readFile(EMBED_FILE);
    return new Response(body, {
      headers: {
        "content-type": "application/javascript; charset=utf-8",
        "cache-control": "public, max-age=600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    // The generated asset is copied into public/embed during the build.
  }

  return new Response(STUB, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=60",
      "x-content-type-options": "nosniff",
    },
  });
}
