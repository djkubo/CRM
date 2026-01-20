-- =====================================================
-- METRICS ENGINE: Backend RPCs for Deterministic KPIs
-- =====================================================

-- Define timezone constant
CREATE OR REPLACE FUNCTION get_system_timezone()
RETURNS text AS $$
BEGIN
  RETURN 'America/Mexico_City';
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- =====================================================
-- KPI: Sales by range
-- =====================================================
CREATE OR REPLACE FUNCTION kpi_sales(
  p_range text DEFAULT 'today', -- today, 7d, 30d, month, year, custom
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  currency text,
  total_amount bigint,
  transaction_count bigint,
  avg_amount bigint
) AS $$
DECLARE
  v_tz text := get_system_timezone();
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  -- Calculate date range based on timezone
  CASE p_range
    WHEN 'today' THEN
      v_start := date_trunc('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
      v_end := v_start + INTERVAL '1 day';
    WHEN '7d' THEN
      v_start := date_trunc('day', NOW() AT TIME ZONE v_tz - INTERVAL '7 days') AT TIME ZONE v_tz;
      v_end := NOW();
    WHEN '30d' THEN
      v_start := date_trunc('day', NOW() AT TIME ZONE v_tz - INTERVAL '30 days') AT TIME ZONE v_tz;
      v_end := NOW();
    WHEN 'month' THEN
      v_start := date_trunc('month', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
      v_end := v_start + INTERVAL '1 month';
    WHEN 'year' THEN
      v_start := date_trunc('year', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
      v_end := v_start + INTERVAL '1 year';
    WHEN 'custom' THEN
      v_start := p_start_date::timestamptz;
      v_end := (p_end_date + 1)::timestamptz;
    ELSE
      v_start := date_trunc('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
      v_end := NOW();
  END CASE;

  RETURN QUERY
  SELECT 
    COALESCE(t.currency, 'usd') as currency,
    COALESCE(SUM(t.amount), 0)::bigint as total_amount,
    COUNT(*)::bigint as transaction_count,
    COALESCE(AVG(t.amount), 0)::bigint as avg_amount
  FROM transactions t
  WHERE t.status = 'succeeded'
    AND t.amount > 0
    AND COALESCE(t.stripe_created_at, t.created_at) >= v_start
    AND COALESCE(t.stripe_created_at, t.created_at) < v_end
  GROUP BY COALESCE(t.currency, 'usd');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- =====================================================
-- KPI: New Customers
-- =====================================================
CREATE OR REPLACE FUNCTION kpi_new_customers(
  p_range text DEFAULT 'today',
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  new_customer_count bigint,
  total_revenue bigint,
  currency text
) AS $$
DECLARE
  v_tz text := get_system_timezone();
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  CASE p_range
    WHEN 'today' THEN
      v_start := date_trunc('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
      v_end := v_start + INTERVAL '1 day';
    WHEN '7d' THEN
      v_start := date_trunc('day', NOW() AT TIME ZONE v_tz - INTERVAL '7 days') AT TIME ZONE v_tz;
      v_end := NOW();
    WHEN '30d' THEN
      v_start := date_trunc('day', NOW() AT TIME ZONE v_tz - INTERVAL '30 days') AT TIME ZONE v_tz;
      v_end := NOW();
    WHEN 'month' THEN
      v_start := date_trunc('month', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
      v_end := v_start + INTERVAL '1 month';
    ELSE
      v_start := date_trunc('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
      v_end := NOW();
  END CASE;

  RETURN QUERY
  WITH first_payments AS (
    SELECT 
      t.customer_email,
      MIN(COALESCE(t.stripe_created_at, t.created_at)) as first_payment_at,
      t.currency
    FROM transactions t
    WHERE t.status = 'succeeded' 
      AND t.amount > 0 
      AND t.customer_email IS NOT NULL
    GROUP BY t.customer_email, t.currency
    HAVING MIN(COALESCE(t.stripe_created_at, t.created_at)) >= v_start
       AND MIN(COALESCE(t.stripe_created_at, t.created_at)) < v_end
  )
  SELECT 
    COUNT(DISTINCT fp.customer_email)::bigint as new_customer_count,
    COALESCE(SUM(t.amount), 0)::bigint as total_revenue,
    COALESCE(fp.currency, 'usd') as currency
  FROM first_payments fp
  JOIN transactions t ON t.customer_email = fp.customer_email 
    AND COALESCE(t.stripe_created_at, t.created_at) = fp.first_payment_at
    AND t.status = 'succeeded'
  GROUP BY fp.currency;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- =====================================================
-- KPI: Renewals
-- =====================================================
CREATE OR REPLACE FUNCTION kpi_renewals(
  p_range text DEFAULT 'today',
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  renewal_count bigint,
  total_revenue bigint,
  currency text
) AS $$
DECLARE
  v_tz text := get_system_timezone();
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  CASE p_range
    WHEN 'today' THEN
      v_start := date_trunc('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
      v_end := v_start + INTERVAL '1 day';
    WHEN '7d' THEN
      v_start := date_trunc('day', NOW() AT TIME ZONE v_tz - INTERVAL '7 days') AT TIME ZONE v_tz;
      v_end := NOW();
    WHEN '30d' THEN
      v_start := date_trunc('day', NOW() AT TIME ZONE v_tz - INTERVAL '30 days') AT TIME ZONE v_tz;
      v_end := NOW();
    WHEN 'month' THEN
      v_start := date_trunc('month', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
      v_end := v_start + INTERVAL '1 month';
    ELSE
      v_start := date_trunc('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
      v_end := NOW();
  END CASE;

  RETURN QUERY
  SELECT 
    COUNT(*)::bigint as renewal_count,
    COALESCE(SUM(t.amount), 0)::bigint as total_revenue,
    COALESCE(t.currency, 'usd') as currency
  FROM transactions t
  WHERE t.status = 'succeeded'
    AND t.amount > 0
    AND t.payment_type = 'renewal'
    AND COALESCE(t.stripe_created_at, t.created_at) >= v_start
    AND COALESCE(t.stripe_created_at, t.created_at) < v_end
  GROUP BY COALESCE(t.currency, 'usd');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- =====================================================
-- KPI: Trial to Paid Conversions
-- =====================================================
CREATE OR REPLACE FUNCTION kpi_trial_to_paid(
  p_range text DEFAULT '30d'
)
RETURNS TABLE (
  conversion_count bigint,
  total_revenue bigint,
  conversion_rate numeric
) AS $$
DECLARE
  v_tz text := get_system_timezone();
  v_start timestamptz;
  v_end timestamptz;
  v_total_trials bigint;
BEGIN
  CASE p_range
    WHEN '7d' THEN
      v_start := NOW() - INTERVAL '7 days';
    WHEN '30d' THEN
      v_start := NOW() - INTERVAL '30 days';
    WHEN '90d' THEN
      v_start := NOW() - INTERVAL '90 days';
    ELSE
      v_start := NOW() - INTERVAL '30 days';
  END CASE;
  v_end := NOW();

  -- Count total trials started in period
  SELECT COUNT(*) INTO v_total_trials
  FROM subscriptions
  WHERE trial_start >= v_start
    AND trial_start < v_end;

  RETURN QUERY
  SELECT 
    COUNT(*)::bigint as conversion_count,
    COALESCE(SUM(t.amount), 0)::bigint as total_revenue,
    CASE WHEN v_total_trials > 0 
      THEN ROUND((COUNT(*)::numeric / v_total_trials) * 100, 2)
      ELSE 0
    END as conversion_rate
  FROM transactions t
  WHERE t.payment_type = 'trial_conversion'
    AND COALESCE(t.stripe_created_at, t.created_at) >= v_start
    AND COALESCE(t.stripe_created_at, t.created_at) < v_end
    AND t.status = 'succeeded';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- =====================================================
-- KPI: Failed Payments
-- =====================================================
CREATE OR REPLACE FUNCTION kpi_failed_payments(
  p_range text DEFAULT 'today'
)
RETURNS TABLE (
  failed_count bigint,
  at_risk_amount bigint,
  currency text
) AS $$
DECLARE
  v_tz text := get_system_timezone();
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  CASE p_range
    WHEN 'today' THEN
      v_start := date_trunc('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
      v_end := v_start + INTERVAL '1 day';
    WHEN '7d' THEN
      v_start := NOW() - INTERVAL '7 days';
      v_end := NOW();
    WHEN '30d' THEN
      v_start := NOW() - INTERVAL '30 days';
      v_end := NOW();
    ELSE
      v_start := date_trunc('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
      v_end := NOW();
  END CASE;

  RETURN QUERY
  SELECT 
    COUNT(*)::bigint as failed_count,
    COALESCE(SUM(t.amount), 0)::bigint as at_risk_amount,
    COALESCE(t.currency, 'usd') as currency
  FROM transactions t
  WHERE t.status = 'failed'
    AND COALESCE(t.stripe_created_at, t.created_at) >= v_start
    AND COALESCE(t.stripe_created_at, t.created_at) < v_end
  GROUP BY COALESCE(t.currency, 'usd');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- =====================================================
-- KPI: Cancellations
-- =====================================================
CREATE OR REPLACE FUNCTION kpi_cancellations(
  p_range text DEFAULT '30d'
)
RETURNS TABLE (
  cancellation_count bigint,
  lost_mrr bigint,
  currency text
) AS $$
DECLARE
  v_start timestamptz;
BEGIN
  CASE p_range
    WHEN '7d' THEN v_start := NOW() - INTERVAL '7 days';
    WHEN '30d' THEN v_start := NOW() - INTERVAL '30 days';
    WHEN '90d' THEN v_start := NOW() - INTERVAL '90 days';
    ELSE v_start := NOW() - INTERVAL '30 days';
  END CASE;

  RETURN QUERY
  SELECT 
    COUNT(*)::bigint as cancellation_count,
    COALESCE(SUM(
      CASE WHEN s.interval = 'year' THEN s.amount / 12 ELSE s.amount END
    ), 0)::bigint as lost_mrr,
    COALESCE(s.currency, 'usd') as currency
  FROM subscriptions s
  WHERE s.status IN ('canceled', 'expired')
    AND s.canceled_at >= v_start
  GROUP BY COALESCE(s.currency, 'usd');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- =====================================================
-- KPI: Churn Rate (30 days)
-- =====================================================
CREATE OR REPLACE FUNCTION kpi_churn_30d()
RETURNS TABLE (
  churned_count bigint,
  active_count bigint,
  churn_rate numeric
) AS $$
BEGIN
  RETURN QUERY
  WITH counts AS (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('canceled', 'expired') 
        AND canceled_at >= NOW() - INTERVAL '30 days') as churned,
      COUNT(*) FILTER (WHERE status = 'active') as active
    FROM subscriptions
  )
  SELECT 
    churned::bigint,
    active::bigint,
    CASE WHEN (churned + active) > 0 
      THEN ROUND((churned::numeric / (churned + active)) * 100, 2)
      ELSE 0
    END as churn_rate
  FROM counts;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- =====================================================
-- KPI: MRR (Monthly Recurring Revenue)
-- =====================================================
CREATE OR REPLACE FUNCTION kpi_mrr()
RETURNS TABLE (
  mrr bigint,
  active_subscriptions bigint,
  currency text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(
      CASE 
        WHEN s.interval = 'year' THEN s.amount / 12
        ELSE s.amount
      END
    ), 0)::bigint as mrr,
    COUNT(*)::bigint as active_subscriptions,
    COALESCE(s.currency, 'usd') as currency
  FROM subscriptions s
  WHERE s.status = 'active'
  GROUP BY COALESCE(s.currency, 'usd');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- =====================================================
-- KPI: Refunds
-- =====================================================
CREATE OR REPLACE FUNCTION kpi_refunds(
  p_range text DEFAULT '30d'
)
RETURNS TABLE (
  refund_count bigint,
  refund_amount bigint,
  currency text
) AS $$
DECLARE
  v_start timestamptz;
BEGIN
  CASE p_range
    WHEN '7d' THEN v_start := NOW() - INTERVAL '7 days';
    WHEN '30d' THEN v_start := NOW() - INTERVAL '30 days';
    WHEN '90d' THEN v_start := NOW() - INTERVAL '90 days';
    ELSE v_start := NOW() - INTERVAL '30 days';
  END CASE;

  RETURN QUERY
  SELECT 
    COUNT(*)::bigint as refund_count,
    COALESCE(ABS(SUM(t.amount)), 0)::bigint as refund_amount,
    COALESCE(t.currency, 'usd') as currency
  FROM transactions t
  WHERE (t.amount < 0 OR t.status IN ('refunded', 'disputed'))
    AND COALESCE(t.stripe_created_at, t.created_at) >= v_start
  GROUP BY COALESCE(t.currency, 'usd');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- =====================================================
-- DATA QUALITY: Health Checks
-- =====================================================
CREATE OR REPLACE FUNCTION data_quality_checks()
RETURNS TABLE (
  check_name text,
  status text,
  count bigint,
  percentage numeric,
  details jsonb
) AS $$
BEGIN
  RETURN QUERY
  
  -- Check 1: Payments without email
  SELECT 
    'payments_without_email'::text,
    CASE WHEN COUNT(*) FILTER (WHERE customer_email IS NULL) * 100.0 / NULLIF(COUNT(*), 0) > 5 
      THEN 'warning' ELSE 'ok' END::text,
    COUNT(*) FILTER (WHERE customer_email IS NULL)::bigint,
    ROUND(COUNT(*) FILTER (WHERE customer_email IS NULL) * 100.0 / NULLIF(COUNT(*), 0), 2)::numeric,
    jsonb_build_object('total', COUNT(*))
  FROM transactions
  WHERE status = 'succeeded'
  
  UNION ALL
  
  -- Check 2: Clients without phone
  SELECT 
    'clients_without_phone'::text,
    'info'::text,
    COUNT(*) FILTER (WHERE phone IS NULL)::bigint,
    ROUND(COUNT(*) FILTER (WHERE phone IS NULL) * 100.0 / NULLIF(COUNT(*), 0), 2)::numeric,
    jsonb_build_object('total', COUNT(*))
  FROM clients
  
  UNION ALL
  
  -- Check 3: Duplicate phones
  SELECT 
    'duplicate_phones'::text,
    CASE WHEN COUNT(*) > 0 THEN 'warning' ELSE 'ok' END::text,
    COUNT(*)::bigint,
    0::numeric,
    jsonb_build_object('phones', jsonb_agg(phone))
  FROM (
    SELECT phone, COUNT(*) as cnt
    FROM clients
    WHERE phone IS NOT NULL AND phone != ''
    GROUP BY phone
    HAVING COUNT(*) > 1
    LIMIT 10
  ) dups
  
  UNION ALL
  
  -- Check 4: Non-normalized emails
  SELECT 
    'non_normalized_emails'::text,
    CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'ok' END::text,
    COUNT(*)::bigint,
    ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM clients WHERE email IS NOT NULL), 0), 2)::numeric,
    jsonb_build_object('sample', jsonb_agg(email) )
  FROM (
    SELECT email
    FROM clients
    WHERE email IS NOT NULL 
      AND (email != lower(email) OR email != trim(email))
    LIMIT 10
  ) bad_emails
  
  UNION ALL
  
  -- Check 5: Mixed currencies in period
  SELECT 
    'mixed_currencies'::text,
    CASE WHEN COUNT(DISTINCT currency) > 1 THEN 'info' ELSE 'ok' END::text,
    COUNT(DISTINCT currency)::bigint,
    0::numeric,
    jsonb_agg(DISTINCT currency)
  FROM transactions
  WHERE created_at >= NOW() - INTERVAL '30 days'
    AND status = 'succeeded';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- =====================================================
-- RECONCILIATION: Compare internal vs external
-- =====================================================
CREATE TABLE IF NOT EXISTS public.reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL, -- 'stripe', 'paypal'
  period_start date NOT NULL,
  period_end date NOT NULL,
  external_total bigint NOT NULL,
  internal_total bigint NOT NULL,
  difference bigint NOT NULL,
  difference_pct numeric NOT NULL,
  status text NOT NULL, -- 'ok', 'warning', 'fail'
  missing_external jsonb DEFAULT '[]',
  missing_internal jsonb DEFAULT '[]',
  duplicates jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage reconciliation_runs" ON public.reconciliation_runs
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- =====================================================
-- METRICS STAGING: For rebuild without affecting live
-- =====================================================
CREATE TABLE IF NOT EXISTS public.metrics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_type text NOT NULL, -- 'staging', 'current'
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  kpis jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  promoted_at timestamptz,
  promoted_by text
);

ALTER TABLE public.metrics_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage metrics_snapshots" ON public.metrics_snapshots
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Rebuild log table
CREATE TABLE IF NOT EXISTS public.rebuild_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
  rows_processed integer DEFAULT 0,
  errors jsonb DEFAULT '[]',
  diff jsonb,
  promoted boolean DEFAULT false,
  created_by text
);

ALTER TABLE public.rebuild_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage rebuild_logs" ON public.rebuild_logs
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- =====================================================
-- REBUILD: Calculate all metrics and store in staging
-- =====================================================
CREATE OR REPLACE FUNCTION rebuild_metrics_staging()
RETURNS jsonb AS $$
DECLARE
  v_kpis jsonb;
  v_sales_today jsonb;
  v_sales_month jsonb;
  v_mrr jsonb;
  v_churn jsonb;
  v_new_customers jsonb;
  v_failed jsonb;
  v_rebuild_id uuid;
BEGIN
  -- Create rebuild log
  INSERT INTO rebuild_logs (status, created_by)
  VALUES ('running', current_user)
  RETURNING id INTO v_rebuild_id;

  -- Gather all KPIs
  SELECT jsonb_agg(row_to_json(s)) INTO v_sales_today FROM kpi_sales('today') s;
  SELECT jsonb_agg(row_to_json(s)) INTO v_sales_month FROM kpi_sales('month') s;
  SELECT jsonb_agg(row_to_json(m)) INTO v_mrr FROM kpi_mrr() m;
  SELECT jsonb_agg(row_to_json(c)) INTO v_churn FROM kpi_churn_30d() c;
  SELECT jsonb_agg(row_to_json(n)) INTO v_new_customers FROM kpi_new_customers('month') n;
  SELECT jsonb_agg(row_to_json(f)) INTO v_failed FROM kpi_failed_payments('30d') f;

  v_kpis := jsonb_build_object(
    'sales_today', COALESCE(v_sales_today, '[]'::jsonb),
    'sales_month', COALESCE(v_sales_month, '[]'::jsonb),
    'mrr', COALESCE(v_mrr, '[]'::jsonb),
    'churn_30d', COALESCE(v_churn, '[]'::jsonb),
    'new_customers_month', COALESCE(v_new_customers, '[]'::jsonb),
    'failed_payments_30d', COALESCE(v_failed, '[]'::jsonb),
    'generated_at', now()
  );

  -- Insert into staging
  INSERT INTO metrics_snapshots (snapshot_type, kpis)
  VALUES ('staging', v_kpis);

  -- Update rebuild log
  UPDATE rebuild_logs SET
    status = 'completed',
    completed_at = now(),
    rows_processed = (
      SELECT COUNT(*) FROM transactions WHERE status = 'succeeded'
    )
  WHERE id = v_rebuild_id;

  RETURN v_kpis;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Promote staging to current
CREATE OR REPLACE FUNCTION promote_metrics_staging()
RETURNS boolean AS $$
DECLARE
  v_staging_id uuid;
BEGIN
  -- Get latest staging
  SELECT id INTO v_staging_id
  FROM metrics_snapshots
  WHERE snapshot_type = 'staging'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_staging_id IS NULL THEN
    RETURN false;
  END IF;

  -- Update staging to current
  UPDATE metrics_snapshots SET
    snapshot_type = 'current',
    promoted_at = now(),
    promoted_by = current_user
  WHERE id = v_staging_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;