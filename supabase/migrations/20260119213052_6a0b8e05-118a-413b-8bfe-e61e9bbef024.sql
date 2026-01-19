-- Table for Stripe Invoices (draft/open)
CREATE TABLE public.invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_invoice_id TEXT NOT NULL UNIQUE,
  customer_email TEXT,
  stripe_customer_id TEXT,
  amount_due INTEGER NOT NULL, -- in cents
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL, -- draft, open, paid, void, uncollectible
  period_end TIMESTAMP WITH TIME ZONE,
  next_payment_attempt TIMESTAMP WITH TIME ZONE,
  hosted_invoice_url TEXT, -- link to Stripe hosted invoice
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies for authenticated users
CREATE POLICY "Authenticated users can view invoices"
  ON public.invoices FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can insert invoices"
  ON public.invoices FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update invoices"
  ON public.invoices FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete invoices"
  ON public.invoices FOR DELETE
  USING (true);

-- Index for faster queries on status
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_next_payment ON public.invoices(next_payment_attempt);