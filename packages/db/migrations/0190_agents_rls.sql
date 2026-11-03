-- 0183 renamed receptionist_profiles to agents, and the table kept its
-- row-level security and policies. The drift check finds a tenant table's RLS
-- by name in the migrations, so this states it under the new name. On a
-- database that ran 0183, neither statement changes anything.
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents FORCE ROW LEVEL SECURITY;
