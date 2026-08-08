import { NextRequest } from "next/server";

import { errorResponse } from "@/lib/api-helpers";
import { requireBusinessAccess, requireSession } from "@/lib/authorization";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const businessId = request.nextUrl.searchParams.get("businessId");
    if (!businessId) {
      return new Response("businessId is required", { status: 400 });
    }

    const session = await requireSession();
    await requireBusinessAccess({ businessId, userId: session.userId });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        }, 15_000);

        request.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
