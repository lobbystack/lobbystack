import { methodNotAllowed } from "@/lib/public-api/http";
import { v1 } from "@/lib/public-api/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = v1.testWebhook;

const notAllowed = methodNotAllowed(["POST"]);
export const GET = notAllowed;
export const PATCH = notAllowed;
export const PUT = notAllowed;
export const DELETE = notAllowed;
