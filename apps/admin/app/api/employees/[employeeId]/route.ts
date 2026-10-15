import { NextResponse } from "next/server";

import { deleteEmployee, updateEmployee } from "@lobbystack/domain";
import { jsonError } from "@/lib/api-helpers";
import { employeeServiceIds, employeeVacation, optionalEmployeePhone } from "@/lib/employee-phone";
import { operatorRoute } from "@/lib/operator-request";

export const dynamic = "force-dynamic";

export const PATCH = operatorRoute<{ employeeId: string }>(async ({ body, userId, businessId, domain }, { employeeId }) => {
  const fields = body as { name?: unknown; phone?: unknown; serviceIds?: unknown; vacation?: unknown };
  const name = typeof fields.name === "string" ? fields.name.trim().slice(0, 200) : "";
  if (!name) return jsonError("Employee name is required.", 400, "employee_name_required");
  const phone = optionalEmployeePhone(fields.phone);
  if (phone === undefined) return jsonError("Enter a valid phone number.", 400, "employee_phone_invalid");
  const serviceIds = employeeServiceIds(fields.serviceIds);
  if (!serviceIds) return jsonError("Choose at least one service.", 400, "employee_services_required");
  const vacation = employeeVacation(fields.vacation);
  if (vacation === undefined) return jsonError("Choose the first and last day of the vacation.", 400, "employee_vacation_invalid");
  const employee = await updateEmployee(domain, { userId, businessId, employeeId, name, phone, serviceIds, vacation });
  return employee ? NextResponse.json({ employee }) : jsonError("Employee not found.", 404);
});

export const DELETE = operatorRoute<{ employeeId: string }>(async ({ userId, businessId, domain }, { employeeId }) => {
  const deleted = await deleteEmployee(domain, { userId, businessId, employeeId });
  return deleted ? NextResponse.json({ ok: true }) : jsonError("Employee not found.", 404);
});
