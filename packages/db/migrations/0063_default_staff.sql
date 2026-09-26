-- Booking assigns every appointment to an active staff member, but self-serve
-- signups never created one, so they could not book. Give each business without
-- an active staff member a default one that stands for the business itself.
INSERT INTO public.staff (business_id, name, timezone)
SELECT business.id, business.name, business.timezone
FROM public.businesses AS business
WHERE NOT EXISTS (
  SELECT 1
  FROM public.staff AS member
  WHERE member.business_id = business.id
    AND member.active
);
