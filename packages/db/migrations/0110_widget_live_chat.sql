-- Live chat with the team in the website widget. A visitor who asks for a
-- person hands the chat to the team and waits for someone to join. This is
-- when they asked; it is cleared once a team member joins, someone hands the
-- chat back to the receptionist, or nobody joined in time.
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS team_requested_at timestamptz;

-- The team member who wrote a message, so the visitor's widget can show their
-- first name. Null on the visitor's own messages and the receptionist's.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sent_by_user_id uuid;
-- NOT VALID, so this file doesn't read every message while it holds the lock
-- that blocks them; 0120 validates the key later under a lighter lock. New
-- and changed rows are checked from now on. Databases that applied this file
-- before it changed already have the key, validated, under the same name.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.messages'::regclass AND conname = 'messages_sent_by_user_id_fkey') THEN
    ALTER TABLE public.messages ADD CONSTRAINT messages_sent_by_user_id_fkey FOREIGN KEY (sent_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL NOT VALID;
  END IF;
END
$$;
