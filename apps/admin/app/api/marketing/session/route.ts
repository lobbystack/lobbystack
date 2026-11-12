import { getAuth } from "@/lib/auth";
import { marketingSessionResponse } from "@/lib/marketing-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return marketingSessionResponse(request, async (headers) => {
    // A check from the marketing site never extends the session.
    const session = await getAuth().api.getSession({ headers, query: { disableRefresh: true } });
    return Boolean(session);
  });
}
