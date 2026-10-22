-- lobbystack:concurrent-index messages_sent_by_user_idx
-- Deleting a user sets sent_by_user_id to null on the messages they wrote, and
-- without this index each deletion reads every message to find them. Only team
-- members' replies in website chats have a sender, so it stays small.
CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_sent_by_user_idx
ON public.messages (sent_by_user_id)
WHERE sent_by_user_id IS NOT NULL;
