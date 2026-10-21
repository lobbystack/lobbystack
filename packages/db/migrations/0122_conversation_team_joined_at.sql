-- When a team member joined a website chat whose visitor asked for a person,
-- through the widget's live chat. Only such a chat goes back to the
-- receptionist once the team goes quiet in it. A chat the team took over on
-- its own stays with the team until someone resumes the AI. Cleared when the
-- chat goes back to the receptionist, the team takes it over another way, or
-- the visitor asks for a person again.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS team_joined_at timestamptz;
