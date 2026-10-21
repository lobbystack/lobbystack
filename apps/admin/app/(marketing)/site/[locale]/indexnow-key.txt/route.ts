import { getIndexNowKeyFileContent } from "@jdevalk/seo-graph-core";

// The IndexNow key file. The proxy routes /<INDEXNOW_KEY>.txt here only when
// the key is set, and the key is read at run time like the proxy reads it.
export const dynamic = "force-dynamic";

export function GET() {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(getIndexNowKeyFileContent(key), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
