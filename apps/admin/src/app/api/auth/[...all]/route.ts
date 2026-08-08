import { auth } from "@/lib/auth";

export const runtime = "nodejs";

const handler = (request: Request) => auth.handler(request);

export { handler as GET, handler as POST };
