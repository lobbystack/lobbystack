import { NextResponse } from "next/server";

import { createEmployee, listEmployees } from "@lobbystack/domain";
import { asApiResponse, jsonError, readJson, requireOperatorBusiness, withOperatorTransaction } from "@/lib/api-helpers";
import { createDomainContext } from "@/lib/domain-context";
import { optionalEmployeePhone } from "@/lib/employee-phone";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim();
    return NextResponse.json(await withOperatorTransaction(request, async ({ session, businessId }) => await listEmployees(createDomainContext(), { userId: session.user.id, businessId, ...(search ? { search } : {}), limit: Number(url.searchParams.get("limit") ?? 50), offset: Number(url.searchParams.get("offset") ?? 0) })));
  } catch (error) { return asApiResponse(error); }
}

export async function POST(request: Request) {
  try {
    const { session, businessId } = await requireOperatorBusiness(request);
    const body = await readJson(request);
    const fields = typeof body === "object" && body !== null ? body as { name?: unknown; phone?: unknown } : {};
    const name = typeof fields.name === "string" ? fields.name.trim().slice(0, 200) : "";
    if (!name) return jsonError("Employee name is required.", 400, "employee_name_required");
    const phone = optionalEmployeePhone(fields.phone);
    if (phone === undefined) return jsonError("Enter a valid phone number.", 400, "employee_phone_invalid");
    const employee = await createEmployee(createDomainContext(), { userId: session.user.id, businessId, name, phone });
    return NextResponse.json({ employee }, { status: 201 });
  } catch (error) { return asApiResponse(error); }
}
