-- The days, in the business's timezone, an employee is away. Both are set or neither.
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS vacation_starts_on date;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS vacation_ends_on date;
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_vacation_range;
ALTER TABLE public.staff ADD CONSTRAINT staff_vacation_range CHECK (
  (vacation_starts_on IS NULL AND vacation_ends_on IS NULL)
  OR (vacation_starts_on IS NOT NULL AND vacation_ends_on IS NOT NULL AND vacation_starts_on <= vacation_ends_on)
);
