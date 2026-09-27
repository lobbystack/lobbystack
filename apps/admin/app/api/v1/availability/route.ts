import { methodNotAllowed } from "@/lib/public-api/http";
import { v1 } from "@/lib/public-api/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = v1.getAvailability;

const notAllowed = methodNotAllowed(["GET"]);
export const POST = notAllowed;
export const PATCH = notAllowed;
export const PUT = notAllowed;
export const DELETE = notAllowed;
