-- Fix rebuild_metrics_staging to use correct function signatures
CREATE OR REPLACE FUNCTION public.rebuild_metrics_staging()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Gather all KPIs using correct signatures (no parameters for functions that don't accept them)
  SELECT jsonb_agg(row_to_json(s)) INTO v_sales_today FROM kpi_sales('today') s;
  SELECT jsonb_agg(row_to_json(s)) INTO v_sales_month FROM kpi_sales('month') s;
  SELECT jsonb_agg(row_to_json(m)) INTO v_mrr FROM kpi_mrr() m;
  
  -- kpi_churn_30d has no parameters
  SELECT jsonb_agg(row_to_json(c)) INTO v_churn FROM kpi_churn_30d() c;
  
  -- kpi_new_customers has no parameters - this was the bug!
  SELECT row_to_json(n)::jsonb INTO v_new_customers FROM kpi_new_customers() n;
  
  -- kpi_failed_payments has no parameters
  SELECT row_to_json(f)::jsonb INTO v_failed FROM kpi_failed_payments() f;

  v_kpis := jsonb_build_object(
    'sales_today', COALESCE(v_sales_today, '[]'::jsonb),
    'sales_month', COALESCE(v_sales_month, '[]'::jsonb),
    'mrr', COALESCE(v_mrr, '[]'::jsonb),
    'churn_30d', COALESCE(v_churn, '[]'::jsonb),
    'new_customers_month', COALESCE(v_new_customers, '{}'::jsonb),
    'failed_payments_30d', COALESCE(v_failed, '{}'::jsonb),
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
      SELECT COUNT(*) FROM transactions WHERE status IN ('succeeded', 'paid')
    )
  WHERE id = v_rebuild_id;

  RETURN v_kpis;
EXCEPTION WHEN OTHERS THEN
  -- Log the error
  UPDATE rebuild_logs SET
    status = 'error',
    completed_at = now(),
    errors = jsonb_build_object('message', SQLERRM, 'state', SQLSTATE)
  WHERE id = v_rebuild_id;
  
  RETURN jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$function$;