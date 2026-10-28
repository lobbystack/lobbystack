import { methodNotAllowed } from "@/lib/public-api/http";
import { v1 } from "@/lib/public-api/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = v1.getPartnerDomains;
export const POST = v1.addPartnerDomain;
export const DELETE = v1.removePartnerDomain;

const notAllowed = methodNotAllowed(["GET", "POST", "DELETE"]);
export const PATCH = notAllowed;
export const PUT = notAllowed;
