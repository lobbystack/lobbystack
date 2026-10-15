import { NextResponse } from "next/server";

import { createEmployee, listEmployees } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { employeeServiceIds, employeeVacation, optionalEmployeePhone } from "@/lib/employee-phone";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const GET = operatorRoute(async ({ request, userId, businessId, domain }) => {
  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim();
  return NextResponse.json(await listEmployees(domain, { userId, businessId, ...(search ? { search } : {}), limit: Number(url.searchParams.get("limit") ?? 50), offset: Number(url.searchParams.get("offset") ?? 0) }));
});

export const POST = operatorRoute(async ({ body, userId, businessId, domain }) => {
  const fields = body as { name?: unknown; phone?: unknown; serviceIds?: unknown; vacation?: unknown };
  const name = typeof fields.name === "string" ? fields.name.trim().slice(0, 200) : "";
  if (!name) return jsonError("Employee name is required.", 400, "employee_name_required");
  const phone = optionalEmployeePhone(fields.phone);
  if (phone === undefined) return jsonError("Enter a valid phone number.", 400, "employee_phone_invalid");
  const serviceIds = employeeServiceIds(fields.serviceIds);
  if (!serviceIds) return jsonError("Choose at least one service.", 400, "employee_services_required");
  const vacation = employeeVacation(fields.vacation);
  if (vacation === undefined) return jsonError("Choose the first and last day of the vacation.", 400, "employee_vacation_invalid");
  const employee = await createEmployee(domain, { userId, businessId, name, phone, serviceIds, vacation });
  return NextResponse.json({ employee }, { status: 201 });
});
