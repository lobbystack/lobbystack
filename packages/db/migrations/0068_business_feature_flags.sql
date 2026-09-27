-- Per-business feature flags, for example {"new_navigation": true}. Absent keys
-- mean off. The admin can also force a flag for every business with an
-- environment variable (see apps/admin/src/lib/navigation-flag.ts).
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS feature_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.businesses DROP CONSTRAINT IF EXISTS businesses_feature_flags_object_check;
ALTER TABLE public.businesses
  ADD CONSTRAINT businesses_feature_flags_object_check CHECK (jsonb_typeof(feature_flags) = 'object');
