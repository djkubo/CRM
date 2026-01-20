-- ============================================
-- STRIPE CUSTOMERS TABLE
-- ============================================
CREATE TABLE public.stripe_customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  email TEXT,
  name TEXT,
  phone TEXT,
  description TEXT,
  created_at_stripe TIMESTAMP WITH TIME ZONE,
  currency TEXT DEFAULT 'usd',
  balance INTEGER DEFAULT 0,
  delinquent BOOLEAN DEFAULT false,
  default_source TEXT,
  invoice_prefix TEXT,
  metadata JSONB DEFAULT '{}',
  tax_exempt TEXT,
  address JSONB,
  shipping JSONB,
  discount JSONB,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_stripe_customers_email ON public.stripe_customers(email);
CREATE INDEX idx_stripe_customers_stripe_id ON public.stripe_customers(stripe_customer_id);

-- RLS
ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage stripe_customers" ON public.stripe_customers
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ============================================
-- STRIPE PRODUCTS TABLE
-- ============================================
CREATE TABLE public.stripe_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_product_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT true,
  images JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  type TEXT, -- 'service' or 'good'
  unit_label TEXT,
  statement_descriptor TEXT,
  tax_code TEXT,
  created_at_stripe TIMESTAMP WITH TIME ZONE,
  updated_at_stripe TIMESTAMP WITH TIME ZONE,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_stripe_products_active ON public.stripe_products(active);

-- RLS
ALTER TABLE public.stripe_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage stripe_products" ON public.stripe_products
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ============================================
-- STRIPE PRICES TABLE
-- ============================================
CREATE TABLE public.stripe_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_price_id TEXT NOT NULL UNIQUE,
  stripe_product_id TEXT REFERENCES public.stripe_products(stripe_product_id),
  active BOOLEAN DEFAULT true,
  currency TEXT DEFAULT 'usd',
  unit_amount INTEGER, -- in cents
  type TEXT, -- 'one_time' or 'recurring'
  billing_scheme TEXT, -- 'per_unit' or 'tiered'
  recurring_interval TEXT, -- 'day', 'week', 'month', 'year'
  recurring_interval_count INTEGER DEFAULT 1,
  recurring_usage_type TEXT, -- 'licensed' or 'metered'
  trial_period_days INTEGER,
  nickname TEXT,
  metadata JSONB DEFAULT '{}',
  lookup_key TEXT,
  tiers JSONB,
  transform_quantity JSONB,
  created_at_stripe TIMESTAMP WITH TIME ZONE,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_stripe_prices_product ON public.stripe_prices(stripe_product_id);
CREATE INDEX idx_stripe_prices_active ON public.stripe_prices(active);

-- RLS
ALTER TABLE public.stripe_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage stripe_prices" ON public.stripe_prices
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ============================================
-- DISPUTES TABLE (Stripe + PayPal)
-- ============================================
CREATE TABLE public.disputes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_dispute_id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL, -- 'stripe' or 'paypal'
  amount INTEGER NOT NULL, -- in cents
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL, -- 'warning_needs_response', 'warning_under_review', 'warning_closed', 'needs_response', 'under_review', 'won', 'lost'
  reason TEXT, -- 'duplicate', 'fraudulent', 'subscription_canceled', 'product_unacceptable', etc.
  charge_id TEXT,
  payment_intent_id TEXT,
  customer_email TEXT,
  customer_id TEXT,
  evidence_due_by TIMESTAMP WITH TIME ZONE,
  is_charge_refundable BOOLEAN,
  has_evidence BOOLEAN DEFAULT false,
  created_at_external TIMESTAMP WITH TIME ZONE,
  updated_at_external TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_disputes_source ON public.disputes(source);
CREATE INDEX idx_disputes_status ON public.disputes(status);
CREATE INDEX idx_disputes_customer ON public.disputes(customer_email);

-- RLS
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage disputes" ON public.disputes
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ============================================
-- BALANCE SNAPSHOTS TABLE
-- ============================================
CREATE TABLE public.balance_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL, -- 'stripe' or 'paypal'
  available_amount INTEGER DEFAULT 0, -- in cents
  pending_amount INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'usd',
  connect_reserved INTEGER DEFAULT 0, -- Stripe Connect reserved
  instant_available INTEGER DEFAULT 0, -- Instant payouts available
  details JSONB DEFAULT '{}', -- Full balance object
  snapshot_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_balance_snapshots_source ON public.balance_snapshots(source);
CREATE INDEX idx_balance_snapshots_date ON public.balance_snapshots(snapshot_at);

-- RLS
ALTER TABLE public.balance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage balance_snapshots" ON public.balance_snapshots
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ============================================
-- PAYOUTS TABLE
-- ============================================
CREATE TABLE public.payouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_payout_id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL, -- 'stripe' or 'paypal'
  amount INTEGER NOT NULL, -- in cents
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL, -- 'pending', 'in_transit', 'paid', 'failed', 'canceled'
  type TEXT, -- 'bank_account', 'card'
  method TEXT, -- 'standard', 'instant'
  description TEXT,
  destination TEXT, -- Bank account ID
  failure_code TEXT,
  failure_message TEXT,
  arrival_date TIMESTAMP WITH TIME ZONE,
  created_at_external TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_payouts_source ON public.payouts(source);
CREATE INDEX idx_payouts_status ON public.payouts(status);
CREATE INDEX idx_payouts_date ON public.payouts(arrival_date);

-- RLS
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage payouts" ON public.payouts
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ============================================
-- PAYPAL SUBSCRIPTIONS TABLE
-- ============================================
CREATE TABLE public.paypal_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  paypal_subscription_id TEXT NOT NULL UNIQUE,
  plan_id TEXT,
  plan_name TEXT,
  status TEXT NOT NULL, -- 'APPROVAL_PENDING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'CANCELLED', 'EXPIRED'
  payer_email TEXT,
  payer_id TEXT,
  payer_name TEXT,
  start_time TIMESTAMP WITH TIME ZONE,
  billing_info JSONB DEFAULT '{}', -- Last payment, next payment, etc.
  subscriber JSONB DEFAULT '{}', -- Subscriber details
  shipping_amount INTEGER,
  tax_amount INTEGER,
  quantity INTEGER DEFAULT 1,
  auto_renewal BOOLEAN DEFAULT true,
  create_time TIMESTAMP WITH TIME ZONE,
  update_time TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_paypal_subs_status ON public.paypal_subscriptions(status);
CREATE INDEX idx_paypal_subs_email ON public.paypal_subscriptions(payer_email);

-- RLS
ALTER TABLE public.paypal_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage paypal_subscriptions" ON public.paypal_subscriptions
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ============================================
-- PAYMENT LINKS TABLE
-- ============================================
CREATE TABLE public.payment_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  external_link_id TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL, -- 'stripe'
  url TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  line_items JSONB DEFAULT '[]',
  allow_promotion_codes BOOLEAN DEFAULT false,
  billing_address_collection TEXT,
  customer_creation TEXT,
  metadata JSONB DEFAULT '{}',
  application_fee_amount INTEGER,
  application_fee_percent NUMERIC,
  created_at_external TIMESTAMP WITH TIME ZONE,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_payment_links_active ON public.payment_links(active);

-- RLS
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage payment_links" ON public.payment_links
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());