-- Every employee does at least one service. Employees added before services
-- could be picked start with all of their business's services.
INSERT INTO public.staff_service_assignments (business_id, staff_id, service_id)
SELECT staff.business_id, staff.id, services.id
FROM public.staff
JOIN public.services ON services.business_id = staff.business_id AND services.deleted_at IS NULL
WHERE staff.is_employee
  AND staff.active
  AND NOT EXISTS (SELECT 1 FROM public.staff_service_assignments existing WHERE existing.staff_id = staff.id)
ON CONFLICT DO NOTHING;
