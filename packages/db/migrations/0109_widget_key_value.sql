-- A widget key is public: the website's script tag carries it. Keep it next to
-- its hash so the dashboard can show the embed snippet again at any time. Keys
-- created before this column keep only their hash.
ALTER TABLE public.widget_keys ADD COLUMN IF NOT EXISTS key_value text;
