import { methodNotAllowed } from "@/lib/public-api/http";
import { v1 } from "@/lib/public-api/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const PATCH = v1.updateCalendarConnection;
export const DELETE = v1.deleteCalendarConnection;

const notAllowed = methodNotAllowed(["PATCH", "DELETE"]);
export const GET = notAllowed;
export const POST = notAllowed;
export const PUT = notAllowed;
