-- =====================================================
-- PERFORMANCE INDEXES FOR KPI QUERIES
-- Fixes statement timeout issues on heavy dashboard queries
-- =====================================================

-- 1. TRANSACTIONS: Composite index for status + date filtering (most common KPI query pattern)
CREATE INDEX IF NOT EXISTS idx_transactions_status_stripe_created 
ON public.transactions (status, stripe_created_at DESC);

-- 2. TRANSACTIONS: Index for currency filtering (used in all KPI aggregations)
CREATE INDEX IF NOT EXISTS idx_transactions_currency 
ON public.transactions (currency);

-- 3. TRANSACTIONS: Composite for successful payments by date (renewals, new sales)
CREATE INDEX IF NOT EXISTS idx_transactions_succeeded_date 
ON public.transactions (stripe_created_at DESC) 
WHERE status = 'succeeded';

-- 4. TRANSACTIONS: Index for failed payments (recovery dashboard)
CREATE INDEX IF NOT EXISTS idx_transactions_failed_date 
ON public.transactions (stripe_created_at DESC) 
WHERE status = 'failed';

-- 5. TRANSACTIONS: Composite for customer_email + status (customer lookup)
CREATE INDEX IF NOT EXISTS idx_transactions_customer_email_status 
ON public.transactions (customer_email, status);

-- 6. CLIENTS: Index for created_at (registration counts)
CREATE INDEX IF NOT EXISTS idx_clients_created_at 
ON public.clients (created_at DESC);

-- 7. CLIENTS: Composite for total_spend ordering (VIP queries)
CREATE INDEX IF NOT EXISTS idx_clients_total_spend_desc 
ON public.clients (total_spend DESC NULLS LAST, created_at DESC);

-- 8. SUBSCRIPTIONS: Composite for status + created_at (trial counts)
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_created 
ON public.subscriptions (status, created_at DESC);

-- 9. SUBSCRIPTIONS: Index for trial_end (expiring trials query)
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_end 
ON public.subscriptions (trial_end) 
WHERE status = 'trialing';

-- 10. SUBSCRIPTIONS: Composite for current_period_end (renewal predictions)
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end 
ON public.subscriptions (current_period_end) 
WHERE status = 'active';

-- 11. Analyze tables to update statistics for query planner
ANALYZE public.transactions;
ANALYZE public.clients;
ANALYZE public.subscriptions;