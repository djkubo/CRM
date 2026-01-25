-- Fix ambiguous column references in dashboard_metrics
-- Migration: 20260126000001_fix_ambiguous_columns.sql
-- Date: 2026-01-26
-- Purpose: Fix "column reference trial_count is ambiguous" error

CREATE OR REPLACE FUNCTION public.dashboard_metrics()
RETURNS TABLE(
  sales_today_usd bigint,
  sales_today_mxn bigint,
  sales_month_usd bigint,
  sales_month_mxn bigint,
  trial_count bigint,
  converted_count bigint,
  churn_count bigint,
  lead_count bigint,
  customer_count bigint,
  recovery_list jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start_today timestamptz;
  v_start_month timestamptz;
BEGIN
  -- Use UTC consistently (no timezone conversion)
  -- This ensures consistency with stripe_created_at timestamps
  v_start_today := DATE_TRUNC('day', NOW());
  v_start_month := DATE_TRUNC('month', NOW());

  RETURN QUERY
  WITH tx AS (
    SELECT
      amount,
      currency,
      COALESCE(stripe_created_at, created_at) AS created_at,
      customer_email,
      source,
      failure_code,
      status
    FROM public.transactions
    -- Include all relevant statuses for proper filtering
    WHERE status IN ('paid', 'succeeded', 'failed', 'requires_payment_method', 'requires_action', 'requires_confirmation')
       OR failure_code IS NOT NULL
  ),
  sales_today AS (
    SELECT
      COALESCE(SUM(CASE WHEN lower(currency) = 'mxn' THEN amount ELSE 0 END), 0) AS mxn,
      COALESCE(SUM(CASE WHEN lower(currency) <> 'mxn' OR currency IS NULL THEN amount ELSE 0 END), 0) AS usd
    FROM tx
    WHERE status IN ('paid', 'succeeded')
      AND created_at >= v_start_today
  ),
  sales_month AS (
    SELECT
      COALESCE(SUM(CASE WHEN lower(currency) = 'mxn' THEN amount ELSE 0 END), 0) AS mxn,
      COALESCE(SUM(CASE WHEN lower(currency) <> 'mxn' OR currency IS NULL THEN amount ELSE 0 END), 0) AS usd
    FROM tx
    WHERE status IN ('paid', 'succeeded')
      AND created_at >= v_start_month
  ),
  lifecycle AS (
    SELECT
      COUNT(*) FILTER (WHERE lifecycle_stage = 'LEAD') AS lc_lead_count,
      COUNT(*) FILTER (WHERE lifecycle_stage = 'CUSTOMER') AS lc_customer_count,
      COUNT(*) FILTER (WHERE lifecycle_stage = 'CHURN') AS lc_churn_count,
      COUNT(DISTINCT email) FILTER (WHERE trial_started_at IS NOT NULL) AS lc_trial_count,
      COUNT(DISTINCT email) FILTER (WHERE converted_at IS NOT NULL) AS lc_converted_count
    FROM public.clients
  ),
  failed AS (
    SELECT
      customer_email,
      SUM(amount) AS amount,
      COALESCE(MIN(source), 'unknown') AS source
    FROM tx
    -- Improved query to capture all failure states
    WHERE status IN ('failed', 'requires_payment_method', 'requires_action', 'requires_confirmation')
      OR failure_code IS NOT NULL
    GROUP BY customer_email
  ),
  failed_ranked AS (
    SELECT
      f.customer_email,
      f.amount,
      f.source,
      c.full_name,
      c.phone
    FROM failed f
    LEFT JOIN public.clients c ON c.email = f.customer_email
    WHERE f.customer_email IS NOT NULL
    ORDER BY f.amount DESC
    LIMIT 100
  )
  SELECT
    (SELECT usd FROM sales_today) AS sales_today_usd,
    (SELECT mxn FROM sales_today) AS sales_today_mxn,
    (SELECT usd FROM sales_month) AS sales_month_usd,
    (SELECT mxn FROM sales_month) AS sales_month_mxn,
    (SELECT lc_trial_count FROM lifecycle),
    (SELECT lc_converted_count FROM lifecycle),
    (SELECT lc_churn_count FROM lifecycle),
    (SELECT lc_lead_count FROM lifecycle),
    (SELECT lc_customer_count FROM lifecycle),
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'email', customer_email,
      'full_name', full_name,
      'phone', phone,
      'amount', amount / 100.0,
      'source', source
    )) FROM failed_ranked), '[]'::jsonb) AS recovery_list;
END;
$$;

COMMENT ON FUNCTION public.dashboard_metrics() IS 'Dashboard metrics with UTC timezone and fixed ambiguous column names (fixed 2026-01-26)';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.dashboard_metrics() TO authenticated;
