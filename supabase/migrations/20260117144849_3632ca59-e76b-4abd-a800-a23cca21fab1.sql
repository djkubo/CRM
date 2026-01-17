-- Create transactions table for storing Stripe failed payments
CREATE TABLE public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_payment_intent_id TEXT UNIQUE NOT NULL,
    stripe_customer_id TEXT,
    customer_email TEXT,
    amount INTEGER NOT NULL,
    currency TEXT DEFAULT 'usd',
    status TEXT NOT NULL,
    failure_code TEXT,
    failure_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    stripe_created_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Create public read/write policies for quick start
CREATE POLICY "Allow public read access on transactions"
ON public.transactions FOR SELECT TO anon, authenticated
USING (true);

CREATE POLICY "Allow public insert access on transactions"
ON public.transactions FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public update access on transactions"
ON public.transactions FOR UPDATE TO anon, authenticated
USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;