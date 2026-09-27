import { apiError } from "@/lib/public-api/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Unknown v1 paths and methods answer in the v1 error format instead of a Next.js 404 page.
function notFound() {
  return apiError(404, "not_found", "No such endpoint. See /api/v1/openapi.json for the list.");
}

export const GET = notFound;
export const POST = notFound;
export const PATCH = notFound;
export const PUT = notFound;
export const DELETE = notFound;
