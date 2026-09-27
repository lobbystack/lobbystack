import { methodNotAllowed } from "@/lib/public-api/http";
import { v1 } from "@/lib/public-api/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = v1.listAppointments;
export const POST = v1.createAppointment;

const notAllowed = methodNotAllowed(["GET", "POST"]);
export const PATCH = notAllowed;
export const PUT = notAllowed;
export const DELETE = notAllowed;
