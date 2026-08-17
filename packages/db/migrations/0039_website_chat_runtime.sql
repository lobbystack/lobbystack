-- Embeddable website chat widget: runtime columns for chat conversations and
-- receptionist profile instructions.

ALTER TABLE public.receptionist_profiles
  ADD COLUMN IF NOT EXISTS chat_instructions text;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS widget_visitor_id uuid REFERENCES public.widget_visitors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS conversations_business_widget_visitor_idx
  ON public.conversations (business_id, widget_visitor_id);

ALTER TABLE public.billing_usage_months
  ADD COLUMN IF NOT EXISTS chat_ai_tokens_used double precision NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS chat_ai_tokens_blocked boolean NOT NULL DEFAULT false;
