-- Add indices to improve performance of Stripe Invoices and Subscriptions

-- Stripe Invoices Indices
CREATE INDEX IF NOT EXISTS idx_stripe_invoices_customer_id ON stripe_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_invoices_subscription_id ON stripe_invoices(subscription_id);
CREATE INDEX IF NOT EXISTS idx_stripe_invoices_created ON stripe_invoices(created DESC);
CREATE INDEX IF NOT EXISTS idx_stripe_invoices_status ON stripe_invoices(status);

-- Stripe Subscriptions Indices
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_customer_id ON stripe_subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_status ON stripe_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_current_period_end ON stripe_subscriptions(current_period_end);

-- Stripe Customers Indices
CREATE INDEX IF NOT EXISTS idx_stripe_customers_email ON stripe_customers(email);

-- Sync Runs Indices
CREATE INDEX IF NOT EXISTS idx_sync_runs_source_status ON sync_runs(source, status);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at ON sync_runs(started_at DESC);
