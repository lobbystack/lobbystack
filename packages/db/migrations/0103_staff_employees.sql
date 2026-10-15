-- Employees are the staff members a business lists by name, with an optional
-- number to transfer callers to. The default staff member that stands for the
-- business itself is not one.
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS is_employee boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS staff_employee_phone_unique
  ON public.staff (business_id, transfer_number)
  WHERE is_employee AND active AND transfer_number IS NOT NULL;
