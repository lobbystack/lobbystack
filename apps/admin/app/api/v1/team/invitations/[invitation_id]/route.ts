import { methodNotAllowed } from "@/lib/public-api/http";
import { v1 } from "@/lib/public-api/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = v1.revokeTeamInvitation;

const notAllowed = methodNotAllowed(["DELETE"]);
export const GET = notAllowed;
export const POST = notAllowed;
export const PATCH = notAllowed;
export const PUT = notAllowed;
