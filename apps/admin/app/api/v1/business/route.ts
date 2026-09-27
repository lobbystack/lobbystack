import { v1 } from "@/lib/public-api/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = v1.getBusiness;
export const PATCH = v1.updateBusiness;
