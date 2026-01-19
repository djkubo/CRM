-- Add unique constraint on stripe_payment_intent_id for upsert to work
CREATE UNIQUE INDEX IF NOT EXISTS transactions_stripe_payment_intent_id_unique 
ON public.transactions (stripe_payment_intent_id);