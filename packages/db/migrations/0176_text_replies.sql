-- Whether the receptionist answers texts to the business's own number.
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS text_replies_enabled boolean DEFAULT false NOT NULL;
