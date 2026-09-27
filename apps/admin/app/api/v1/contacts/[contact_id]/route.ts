import { methodNotAllowed } from "@/lib/public-api/http";
import { v1 } from "@/lib/public-api/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = v1.getContact;
export const PATCH = v1.updateContact;

const notAllowed = methodNotAllowed(["GET", "PATCH"]);
export const POST = notAllowed;
export const PUT = notAllowed;
export const DELETE = notAllowed;
