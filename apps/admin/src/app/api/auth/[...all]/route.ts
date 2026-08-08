import { auth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = (request: Request) => auth.handler(request);

export { handler as GET, handler as POST };
