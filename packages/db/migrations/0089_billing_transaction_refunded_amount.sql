-- A refunded Polar order kept its full total and only its status said it was
-- refunded, so a partial refund never showed how much went back. This stores
-- the refunded amount with its tax, the same amount the affiliate commission
-- subtracts. Existing rows start at 0 until Polar sends the order again.
ALTER TABLE public.billing_transactions
  ADD COLUMN IF NOT EXISTS refunded_amount_cents integer NOT NULL DEFAULT 0;
