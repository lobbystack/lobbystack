import { methodNotAllowed } from "@/lib/public-api/http";
import { v1 } from "@/lib/public-api/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = v1.getKnowledgeEntry;
export const PATCH = v1.updateKnowledgeEntry;
export const DELETE = v1.deleteKnowledgeEntry;

const notAllowed = methodNotAllowed(["GET", "PATCH", "DELETE"]);
export const POST = notAllowed;
export const PUT = notAllowed;
