-- Comprehensive metrics verification query
-- Compare dashboard_metrics() RPC with manual queries

-- Part 1: RPC Results
SELECT 'RPC Results' as source,
  sales_today_usd / 100.0 as today_usd,
  sales_today_mxn / 100.0 as today_mxn,
  sales_month_usd / 100.0 as month_usd,
  sales_month_mxn / 100.0 as month_mxn,
  trial_count,
  converted_count,
  churn_count,
  jsonb_array_length(recovery_list) as recovery_count
FROM dashboard_metrics();

-- Part 2: Manual Queries for Today
WITH today_sales AS (
  SELECT
    COALESCE(SUM(CASE WHEN currency != 'mxn' THEN amount ELSE 0 END), 0) / 100.0 AS usd,
    COALESCE(SUM(CASE WHEN currency = 'mxn' THEN amount ELSE 0 END), 0) / 100.0 AS mxn,
    COUNT(*) as tx_count
  FROM transactions
  WHERE status IN ('paid', 'succeeded')
    AND DATE(COALESCE(stripe_created_at, created_at)) = CURRENT_DATE
)
SELECT 'Manual Today' as source,
  usd as today_usd,
  mxn as today_mxn,
  NULL::numeric as month_usd,
  NULL::numeric as month_mxn,
  NULL::bigint as trial_count,
  NULL::bigint as converted_count,
  NULL::bigint as churn_count,
  tx_count::bigint as today_tx_count
FROM today_sales;

-- Part 3: Manual Queries for Month
WITH month_sales AS (
  SELECT
    COALESCE(SUM(CASE WHEN currency != 'mxn' THEN amount ELSE 0 END), 0) / 100.0 AS usd,
    COALESCE(SUM(CASE WHEN currency = 'mxn' THEN amount ELSE 0 END), 0) / 100.0 AS mxn,
    COUNT(*) as tx_count
  FROM transactions
  WHERE status IN ('paid', 'succeeded')
    AND DATE_TRUNC('month', COALESCE(stripe_created_at, created_at)) = DATE_TRUNC('month', NOW())
)
SELECT 'Manual Month' as source,
  NULL::numeric as today_usd,
  NULL::numeric as today_mxn,
  usd as month_usd,
  mxn as month_mxn,
  NULL::bigint as trial_count,
  NULL::bigint as converted_count,
  NULL::bigint as churn_count,
  tx_count::bigint as month_tx_count
FROM month_sales;

-- Part 4: Recovery List Manual Count
WITH failed_customers AS (
  SELECT COUNT(DISTINCT customer_email) as count
  FROM transactions
  WHERE (status IN ('failed', 'requires_payment_method', 'requires_action', 'requires_confirmation')
     OR failure_code IS NOT NULL)
    AND customer_email IS NOT NULL
)
SELECT 'Manual Recovery' as source,
  NULL::numeric as today_usd,
  NULL::numeric as today_mxn,
  NULL::numeric as month_usd,
  NULL::numeric as month_mxn,
  NULL::bigint as trial_count,
  NULL::bigint as converted_count,
  NULL::bigint as churn_count,
  count as recovery_count
FROM failed_customers;
