-- An employee's working hours and time off sit next to the business's own. A
-- business_hours or closures row with a staff_id belongs to that staff member;
-- one without belongs to the business. A staff member with no hours rows works
-- the business's hours, and a closure with a staff_id is that person's leave.
ALTER TABLE public.business_hours ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE;
ALTER TABLE public.closures ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff(id) ON DELETE CASCADE;

-- The business's hours stay unique per day and opening time among the rows
-- without a staff member, and each staff member's hours among their own.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'business_hours_business_day_open_unique' AND indexdef NOT LIKE '%WHERE%') THEN
    DROP INDEX public.business_hours_business_day_open_unique;
  END IF;
END
$$;
CREATE UNIQUE INDEX IF NOT EXISTS business_hours_business_day_open_unique
  ON public.business_hours (business_id, day_of_week, open_minutes) WHERE staff_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS business_hours_staff_day_open_unique
  ON public.business_hours (staff_id, day_of_week, open_minutes) WHERE staff_id IS NOT NULL;
