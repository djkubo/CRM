-- ============================================================
-- KPI FIXES: Cross-provider correctness + Trials Started counter
-- - Include Stripe (status=succeeded) AND PayPal (status=paid)
-- - Use customer_email (PayPal doesn't populate stripe_customer_id)
-- - Add kpi_trials_started used by Command Center dashboard
-- ============================================================

CREATE OR REPLACE FUNCTION public.kpi_sales(
  p_range text DEFAULT 'today',
  p_start_date text DEFAULT NULL,
  p_end_date text DEFAULT NULL
)
RETURNS TABLE(
  currency text,
  total_amount bigint,
  transaction_count bigint,
  avg_amount numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_tz text := 'America/Mexico_City';
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := (p_start_date || ' 00:00:00')::timestamp AT TIME ZONE v_tz;
    v_end := (p_end_date || ' 23:59:59')::timestamp AT TIME ZONE v_tz;
  ELSIF p_range = 'today' THEN
    v_start := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
    v_end := v_start + INTERVAL '1 day';
  ELSIF p_range = '7d' THEN
    v_end := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz + INTERVAL '1 day';
    v_start := v_end - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN
    v_start := DATE_TRUNC('month', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
    v_end := v_start + INTERVAL '1 month';
  ELSE
    v_start := '1970-01-01'::timestamptz;
    v_end := NOW() + INTERVAL '1 day';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(t.currency, 'usd')::text,
    COALESCE(SUM(t.amount), 0)::bigint,
    COUNT(*)::bigint,
    COALESCE(AVG(t.amount), 0)::numeric
  FROM transactions t
  WHERE t.status IN ('paid', 'succeeded')
    AND t.stripe_created_at >= v_start
    AND t.stripe_created_at < v_end
  GROUP BY t.currency;
END;
$$;

CREATE OR REPLACE FUNCTION public.kpi_new_customers(
  p_range text DEFAULT 'today',
  p_start_date text DEFAULT NULL,
  p_end_date text DEFAULT NULL
)
RETURNS TABLE(
  currency text,
  new_customer_count bigint,
  total_revenue bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_tz text := 'America/Mexico_City';
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := (p_start_date || ' 00:00:00')::timestamp AT TIME ZONE v_tz;
    v_end := (p_end_date || ' 23:59:59')::timestamp AT TIME ZONE v_tz;
  ELSIF p_range = 'today' THEN
    v_start := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
    v_end := v_start + INTERVAL '1 day';
  ELSIF p_range = '7d' THEN
    v_end := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz + INTERVAL '1 day';
    v_start := v_end - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN
    v_start := DATE_TRUNC('month', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
    v_end := v_start + INTERVAL '1 month';
  ELSE
    v_start := '1970-01-01'::timestamptz;
    v_end := NOW() + INTERVAL '1 day';
  END IF;

  RETURN QUERY
  WITH first_payments AS (
    SELECT DISTINCT ON (LOWER(t.customer_email), COALESCE(t.currency, 'usd'))
      LOWER(t.customer_email) AS customer_email,
      COALESCE(t.currency, 'usd')::text AS currency,
      t.stripe_created_at AS first_payment_date,
      t.amount AS first_amount
    FROM transactions t
    WHERE t.status IN ('paid', 'succeeded')
      AND t.customer_email IS NOT NULL
      AND t.stripe_created_at IS NOT NULL
    ORDER BY LOWER(t.customer_email), COALESCE(t.currency, 'usd'), t.stripe_created_at ASC
  )
  SELECT
    fp.currency,
    COUNT(*)::bigint AS new_customer_count,
    COALESCE(SUM(fp.first_amount), 0)::bigint AS total_revenue
  FROM first_payments fp
  WHERE fp.first_payment_date >= v_start
    AND fp.first_payment_date < v_end
  GROUP BY fp.currency;
END;
$$;

CREATE OR REPLACE FUNCTION public.kpi_renewals(
  p_range text DEFAULT 'today',
  p_start_date text DEFAULT NULL,
  p_end_date text DEFAULT NULL
)
RETURNS TABLE(
  currency text,
  renewal_count bigint,
  total_revenue bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_tz text := 'America/Mexico_City';
BEGIN
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN
    v_start := (p_start_date || ' 00:00:00')::timestamp AT TIME ZONE v_tz;
    v_end := (p_end_date || ' 23:59:59')::timestamp AT TIME ZONE v_tz;
  ELSIF p_range = 'today' THEN
    v_start := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
    v_end := v_start + INTERVAL '1 day';
  ELSIF p_range = '7d' THEN
    v_end := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz + INTERVAL '1 day';
    v_start := v_end - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN
    v_start := DATE_TRUNC('month', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
    v_end := v_start + INTERVAL '1 month';
  ELSE
    v_start := '1970-01-01'::timestamptz;
    v_end := NOW() + INTERVAL '1 day';
  END IF;

  RETURN QUERY
  WITH first_payments AS (
    SELECT
      LOWER(t.customer_email) AS customer_email,
      MIN(t.stripe_created_at) AS first_date
    FROM transactions t
    WHERE t.status IN ('paid', 'succeeded')
      AND t.customer_email IS NOT NULL
      AND t.stripe_created_at IS NOT NULL
    GROUP BY LOWER(t.customer_email)
  ),
  renewals AS (
    SELECT
      COALESCE(t.currency, 'usd')::text AS currency,
      t.amount
    FROM transactions t
    INNER JOIN first_payments fp ON LOWER(t.customer_email) = fp.customer_email
    WHERE t.status IN ('paid', 'succeeded')
      AND t.stripe_created_at >= v_start
      AND t.stripe_created_at < v_end
      AND t.stripe_created_at > fp.first_date
  )
  SELECT
    r.currency,
    COUNT(*)::bigint AS renewal_count,
    COALESCE(SUM(r.amount), 0)::bigint AS total_revenue
  FROM renewals r
  GROUP BY r.currency;
END;
$$;

DROP FUNCTION IF EXISTS public.kpi_trials_started(text);
CREATE OR REPLACE FUNCTION public.kpi_trials_started(
  p_range text DEFAULT 'today'
)
RETURNS TABLE(
  trial_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
  v_tz text := 'America/Mexico_City';
BEGIN
  IF p_range = 'today' THEN
    v_start := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
    v_end := v_start + INTERVAL '1 day';
  ELSIF p_range = '7d' THEN
    v_end := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz + INTERVAL '1 day';
    v_start := v_end - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN
    v_start := DATE_TRUNC('month', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz;
    v_end := v_start + INTERVAL '1 month';
  ELSE
    v_start := '1970-01-01'::timestamptz;
    v_end := NOW() + INTERVAL '1 day';
  END IF;

  RETURN QUERY
  SELECT COUNT(*)::bigint
  FROM subscriptions s
  WHERE s.trial_start IS NOT NULL
    AND s.trial_start >= v_start
    AND s.trial_start < v_end;
END;
$$;

GRANT EXECUTE ON FUNCTION public.kpi_sales(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_new_customers(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_renewals(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kpi_trials_started(text) TO authenticated;

