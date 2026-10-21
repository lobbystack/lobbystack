import { methodNotAllowed } from "@/lib/public-api/http";
import { v1 } from "@/lib/public-api/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = v1.listBusinesses;
export const POST = v1.createBusiness;

const notAllowed = methodNotAllowed(["GET", "POST"]);
export const PATCH = notAllowed;
export const PUT = notAllowed;
export const DELETE = notAllowed;
