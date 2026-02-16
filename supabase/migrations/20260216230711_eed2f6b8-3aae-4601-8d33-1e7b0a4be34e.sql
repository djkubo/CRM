-- ============================================================
-- SECURITY HARDENING (Lovable/Supabase Security Scan)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.app_admins
    WHERE user_id = auth.uid()
  );
EXCEPTION
  WHEN undefined_table THEN
    RETURN false;
END;
$$;

-- CLIENTS (PII)
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clients FROM anon;

DROP POLICY IF EXISTS "Allow public read access" ON public.clients;
DROP POLICY IF EXISTS "Allow public insert access" ON public.clients;
DROP POLICY IF EXISTS "Allow public update access" ON public.clients;
DROP POLICY IF EXISTS "Allow public delete access" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can view clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can update clients" ON public.clients;
DROP POLICY IF EXISTS "Authenticated users can delete clients" ON public.clients;
DROP POLICY IF EXISTS "Admin can view clients" ON public.clients;
DROP POLICY IF EXISTS "Admin can insert clients" ON public.clients;
DROP POLICY IF EXISTS "Admin can update clients" ON public.clients;
DROP POLICY IF EXISTS "Admin can delete clients" ON public.clients;
DROP POLICY IF EXISTS "block_public_access" ON public.clients;

CREATE POLICY "block_public_access" ON public.clients FOR SELECT TO anon USING (false);
CREATE POLICY "Admin can view clients" ON public.clients FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "Admin can insert clients" ON public.clients FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "Admin can update clients" ON public.clients FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admin can delete clients" ON public.clients FOR DELETE TO authenticated USING (public.is_admin());

-- DISPUTES (PII / financial)
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.disputes FROM anon;
DROP POLICY IF EXISTS "Admin can manage disputes" ON public.disputes;
DROP POLICY IF EXISTS "block_public_access" ON public.disputes;
CREATE POLICY "block_public_access" ON public.disputes FOR SELECT TO anon USING (false);
CREATE POLICY "Admin can manage disputes" ON public.disputes FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- CHAT_EVENTS
ALTER TABLE public.chat_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.chat_events FROM anon;
DROP POLICY IF EXISTS "Allow Public Read" ON public.chat_events;
DROP POLICY IF EXISTS "Allow Public Insert" ON public.chat_events;
DROP POLICY IF EXISTS "Admin can manage chat_events" ON public.chat_events;
DROP POLICY IF EXISTS "Admin can read chat_events" ON public.chat_events;
DROP POLICY IF EXISTS "Admin can insert chat_events" ON public.chat_events;
DROP POLICY IF EXISTS "Admin full access chat_events" ON public.chat_events;
DROP POLICY IF EXISTS "Service role full access chat_events" ON public.chat_events;
DROP POLICY IF EXISTS "block_public_access" ON public.chat_events;

CREATE POLICY "block_public_access" ON public.chat_events FOR SELECT TO anon USING (false);
CREATE POLICY "Admin can manage chat_events" ON public.chat_events FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Service role full access chat_events" ON public.chat_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- clients_with_staging
DO $do$
DECLARE
  v_relkind "char";
BEGIN
  SELECT c.relkind INTO v_relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'clients_with_staging' LIMIT 1;

  IF v_relkind IS NULL THEN RETURN; END IF;

  EXECUTE 'REVOKE ALL ON TABLE public.clients_with_staging FROM anon';
  EXECUTE 'REVOKE ALL ON TABLE public.clients_with_staging FROM PUBLIC';
  EXECUTE 'GRANT SELECT ON TABLE public.clients_with_staging TO authenticated';
  EXECUTE 'GRANT SELECT ON TABLE public.clients_with_staging TO service_role';

  IF v_relkind IN ('r', 'p') THEN
    EXECUTE 'ALTER TABLE public.clients_with_staging ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "block_public_access" ON public.clients_with_staging';
    EXECUTE 'DROP POLICY IF EXISTS "Admin can manage clients_with_staging" ON public.clients_with_staging';
    EXECUTE 'DROP POLICY IF EXISTS "Service role full access clients_with_staging" ON public.clients_with_staging';
    EXECUTE $$CREATE POLICY "block_public_access" ON public.clients_with_staging FOR SELECT TO anon USING (false)$$;
    EXECUTE $$CREATE POLICY "Admin can manage clients_with_staging" ON public.clients_with_staging FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())$$;
    EXECUTE $$CREATE POLICY "Service role full access clients_with_staging" ON public.clients_with_staging FOR ALL TO service_role USING (true) WITH CHECK (true)$$;
  END IF;
END $do$;

-- data_quality_checks
DROP FUNCTION IF EXISTS public.data_quality_checks();
CREATE OR REPLACE FUNCTION public.data_quality_checks()
RETURNS TABLE(check_name text, status text, count bigint, percentage numeric, details jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  SELECT 'payments_without_email'::text, CASE WHEN COUNT(*) FILTER (WHERE t.customer_email IS NULL) * 100.0 / NULLIF(COUNT(*), 0) > 5 THEN 'warning' ELSE 'ok' END::text, COUNT(*) FILTER (WHERE t.customer_email IS NULL)::bigint, ROUND(COUNT(*) FILTER (WHERE t.customer_email IS NULL) * 100.0 / NULLIF(COUNT(*), 0), 2)::numeric, jsonb_build_object('total', COUNT(*)) FROM transactions t WHERE t.status IN ('succeeded', 'paid')
  UNION ALL
  SELECT 'clients_without_phone'::text, 'info'::text, COUNT(*) FILTER (WHERE c.phone IS NULL)::bigint, ROUND(COUNT(*) FILTER (WHERE c.phone IS NULL) * 100.0 / NULLIF(COUNT(*), 0), 2)::numeric, jsonb_build_object('total', COUNT(*)) FROM clients c
  UNION ALL
  SELECT 'duplicate_phones'::text, CASE WHEN COUNT(*) > 0 THEN 'warning' ELSE 'ok' END::text, COUNT(*)::bigint, 0::numeric, COALESCE(jsonb_build_object('phones', jsonb_agg(dups.phone)), '{}'::jsonb) FROM (SELECT c.phone, COUNT(*) as cnt FROM clients c WHERE c.phone IS NOT NULL AND c.phone != '' GROUP BY c.phone HAVING COUNT(*) > 1 LIMIT 10) dups
  UNION ALL
  SELECT 'non_normalized_emails'::text, CASE WHEN COUNT(*) > 0 THEN 'critical' ELSE 'ok' END::text, COUNT(*)::bigint, ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM clients WHERE email IS NOT NULL), 0), 2)::numeric, COALESCE(jsonb_build_object('sample', jsonb_agg(bad.email)), '{}'::jsonb) FROM (SELECT c.email FROM clients c WHERE c.email IS NOT NULL AND (c.email != lower(c.email) OR c.email != trim(c.email)) LIMIT 10) bad
  UNION ALL
  SELECT 'mixed_currencies'::text, CASE WHEN COUNT(DISTINCT t.currency) > 1 THEN 'info' ELSE 'ok' END::text, COUNT(DISTINCT t.currency)::bigint, 0::numeric, COALESCE(jsonb_agg(DISTINCT t.currency), '[]'::jsonb) FROM transactions t WHERE t.created_at >= NOW() - INTERVAL '30 days' AND t.status IN ('succeeded', 'paid')
  UNION ALL
  SELECT 'clients_without_source'::text, CASE WHEN COUNT(*) FILTER (WHERE c.acquisition_source IS NULL) * 100.0 / NULLIF(COUNT(*), 0) > 30 THEN 'warning' ELSE 'info' END::text, COUNT(*) FILTER (WHERE c.acquisition_source IS NULL)::bigint, ROUND(COUNT(*) FILTER (WHERE c.acquisition_source IS NULL) * 100.0 / NULLIF(COUNT(*), 0), 2)::numeric, jsonb_build_object('total', COUNT(*)) FROM clients c;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.data_quality_checks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.data_quality_checks() TO authenticated, service_role;

-- rebuild_metrics_staging
DROP FUNCTION IF EXISTS public.rebuild_metrics_staging();
CREATE OR REPLACE FUNCTION public.rebuild_metrics_staging()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_kpis jsonb;
  v_sales_today jsonb;
  v_sales_month jsonb;
  v_mrr jsonb;
  v_new_customers jsonb;
  v_rebuild_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  INSERT INTO rebuild_logs (status, created_by) VALUES ('running', current_user) RETURNING id INTO v_rebuild_id;
  SELECT jsonb_agg(row_to_json(s)) INTO v_sales_today FROM kpi_sales('today') s;
  SELECT jsonb_agg(row_to_json(s)) INTO v_sales_month FROM kpi_sales('month') s;
  SELECT jsonb_agg(row_to_json(m)) INTO v_mrr FROM kpi_mrr_summary() m;
  SELECT row_to_json(n)::jsonb INTO v_new_customers FROM kpi_new_customers() n LIMIT 1;
  v_kpis := jsonb_build_object(
    'sales_today', COALESCE(v_sales_today, '[]'::jsonb),
    'sales_month', COALESCE(v_sales_month, '[]'::jsonb),
    'mrr', COALESCE(v_mrr, '[]'::jsonb),
    'new_customers_month', COALESCE(v_new_customers, '{}'::jsonb),
    'generated_at', now()
  );
  INSERT INTO metrics_snapshots (snapshot_type, kpis) VALUES ('staging', v_kpis);
  UPDATE rebuild_logs SET status = 'completed', completed_at = now(), rows_processed = (SELECT COUNT(*) FROM transactions WHERE status IN ('succeeded', 'paid')) WHERE id = v_rebuild_id;
  RETURN v_kpis;
EXCEPTION WHEN OTHERS THEN
  UPDATE rebuild_logs SET status = 'error', completed_at = now(), errors = jsonb_build_object('message', SQLERRM, 'state', SQLSTATE) WHERE id = v_rebuild_id;
  RETURN jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE);
END;
$function$;

-- promote_metrics_staging
DROP FUNCTION IF EXISTS public.promote_metrics_staging();
CREATE OR REPLACE FUNCTION public.promote_metrics_staging()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_staging_id uuid;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT id INTO v_staging_id FROM metrics_snapshots WHERE snapshot_type = 'staging' ORDER BY created_at DESC LIMIT 1;
  IF v_staging_id IS NULL THEN RETURN false; END IF;
  UPDATE metrics_snapshots SET snapshot_type = 'current', promoted_at = now(), promoted_by = current_user WHERE id = v_staging_id;
  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.rebuild_metrics_staging() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.promote_metrics_staging() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebuild_metrics_staging() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.promote_metrics_staging() TO authenticated, service_role;

-- Staging counts
DROP FUNCTION IF EXISTS public.get_staging_counts_accurate();
CREATE OR REPLACE FUNCTION public.get_staging_counts_accurate()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET statement_timeout = '10s' SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN (SELECT json_build_object(
    'ghl_total', COALESCE((SELECT COUNT(*) FROM ghl_contacts_raw), 0),
    'ghl_unprocessed', COALESCE((SELECT COUNT(*) FROM ghl_contacts_raw WHERE processed_at IS NULL), 0),
    'manychat_total', COALESCE((SELECT COUNT(*) FROM manychat_contacts_raw), 0),
    'manychat_unprocessed', COALESCE((SELECT COUNT(*) FROM manychat_contacts_raw WHERE processed_at IS NULL), 0),
    'csv_total', COALESCE((SELECT COUNT(*) FROM csv_imports_raw), 0),
    'csv_staged', COALESCE((SELECT COUNT(*) FROM csv_imports_raw WHERE processing_status IN ('staged', 'pending')), 0),
    'clients_total', COALESCE((SELECT COUNT(*) FROM clients), 0),
    'transactions_total', COALESCE((SELECT COUNT(*) FROM transactions), 0)
  ));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_staging_counts_accurate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staging_counts_accurate() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_staging_counts_fast();
CREATE OR REPLACE FUNCTION public.get_staging_counts_fast()
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN (SELECT json_build_object(
    'ghl_total', COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'ghl_contacts_raw'), 0),
    'ghl_unprocessed', COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'ghl_contacts_raw'), 0),
    'manychat_total', COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'manychat_contacts_raw'), 0),
    'manychat_unprocessed', COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'manychat_contacts_raw'), 0),
    'csv_total', COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'csv_imports_raw'), 0),
    'csv_staged', COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'csv_imports_raw'), 0),
    'clients_total', COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'clients'), 0),
    'transactions_total', COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'transactions'), 0)
  ));
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_staging_counts_fast() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_staging_counts_fast() TO authenticated, service_role;

-- kpi_mrr_summary
DROP FUNCTION IF EXISTS public.kpi_mrr_summary();
CREATE OR REPLACE FUNCTION public.kpi_mrr_summary()
RETURNS TABLE(mrr bigint, active_count bigint, at_risk_amount bigint, at_risk_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET statement_timeout TO '10s' SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT
    COALESCE(SUM(CASE WHEN status IN ('active', 'trialing') THEN CASE WHEN interval = 'year' THEN amount / 12 WHEN interval = 'week' THEN amount * 4 ELSE amount END ELSE 0 END), 0)::bigint,
    COUNT(*) FILTER (WHERE status IN ('active', 'trialing'))::bigint,
    COALESCE(SUM(CASE WHEN status IN ('past_due', 'unpaid') THEN amount ELSE 0 END), 0)::bigint,
    COUNT(*) FILTER (WHERE status IN ('past_due', 'unpaid'))::bigint
  FROM subscriptions;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.kpi_mrr_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kpi_mrr_summary() TO authenticated, service_role;

-- kpi_invoices_summary
DROP FUNCTION IF EXISTS public.kpi_invoices_summary();
CREATE OR REPLACE FUNCTION public.kpi_invoices_summary()
RETURNS TABLE(pending_total bigint, pending_count bigint, paid_total bigint, next_72h_total bigint, next_72h_count bigint, uncollectible_total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET statement_timeout TO '10s' SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT
    COALESCE(SUM(amount_due) FILTER (WHERE status IN ('open', 'draft')), 0)::bigint,
    COUNT(*) FILTER (WHERE status IN ('open', 'draft'))::bigint,
    COALESCE(SUM(amount_paid) FILTER (WHERE status = 'paid'), 0)::bigint,
    COALESCE(SUM(amount_due) FILTER (WHERE status IN ('open', 'draft') AND next_payment_attempt <= NOW() + INTERVAL '72 hours'), 0)::bigint,
    COUNT(*) FILTER (WHERE status IN ('open', 'draft') AND next_payment_attempt <= NOW() + INTERVAL '72 hours')::bigint,
    COALESCE(SUM(amount_due) FILTER (WHERE status = 'uncollectible'), 0)::bigint
  FROM invoices;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.kpi_invoices_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kpi_invoices_summary() TO authenticated, service_role;

-- dashboard_metrics
DROP FUNCTION IF EXISTS public.dashboard_metrics();
CREATE OR REPLACE FUNCTION public.dashboard_metrics()
RETURNS TABLE(sales_today_usd bigint, sales_today_mxn bigint, sales_month_usd bigint, sales_month_mxn bigint, trial_count bigint, converted_count bigint, churn_count bigint, lead_count bigint, customer_count bigint, recovery_list jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET statement_timeout TO '8s' SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY
  WITH
  sales_data AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE stripe_created_at >= CURRENT_DATE AND (currency IS NULL OR lower(currency) = 'usd')), 0) AS today_usd,
      COALESCE(SUM(amount) FILTER (WHERE stripe_created_at >= CURRENT_DATE AND lower(currency) = 'mxn'), 0) AS today_mxn,
      COALESCE(SUM(amount) FILTER (WHERE (currency IS NULL OR lower(currency) = 'usd')), 0) AS month_usd,
      COALESCE(SUM(amount) FILTER (WHERE lower(currency) = 'mxn'), 0) AS month_mxn
    FROM transactions WHERE stripe_created_at >= date_trunc('month', CURRENT_DATE) AND status IN ('succeeded', 'paid')
  ),
  lifecycle AS (SELECT * FROM mv_client_lifecycle_counts LIMIT 1),
  failed_txs AS (
    SELECT customer_email, SUM(amount) as total_amount, MIN(source) as source
    FROM transactions WHERE status IN ('failed', 'requires_payment_method', 'requires_action') AND customer_email IS NOT NULL AND stripe_created_at >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY customer_email ORDER BY SUM(amount) DESC LIMIT 50
  ),
  recovery AS (
    SELECT jsonb_agg(jsonb_build_object('email', f.customer_email, 'full_name', c.full_name, 'phone', c.phone, 'amount', f.total_amount / 100.0, 'source', f.source)) AS list
    FROM failed_txs f LEFT JOIN clients c ON c.email = f.customer_email
  )
  SELECT s.today_usd::bigint, s.today_mxn::bigint, s.month_usd::bigint, s.month_mxn::bigint, l.trial_count::bigint, l.converted_count::bigint, l.churn_count::bigint, l.lead_count::bigint, l.customer_count::bigint, COALESCE(r.list, '[]'::jsonb)
  FROM sales_data s, lifecycle l, recovery r;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.dashboard_metrics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_metrics() TO authenticated, service_role;

-- kpi_sales_summary
DROP FUNCTION IF EXISTS public.kpi_sales_summary();
CREATE OR REPLACE FUNCTION public.kpi_sales_summary()
RETURNS TABLE(sales_usd bigint, sales_mxn bigint, refunds_usd bigint, refunds_mxn bigint, today_usd bigint, today_mxn bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET statement_timeout TO '3s' SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT month_usd::bigint, month_mxn::bigint, refunds_usd::bigint, refunds_mxn::bigint, today_usd::bigint, today_mxn::bigint FROM mv_sales_summary LIMIT 1;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.kpi_sales_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kpi_sales_summary() TO authenticated, service_role;

-- cleanup_old_data
DROP FUNCTION IF EXISTS public.cleanup_old_data();
CREATE OR REPLACE FUNCTION public.cleanup_old_data()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_ghl_deleted integer; v_manychat_deleted integer; v_sync_runs_deleted integer; v_events_deleted integer; v_campaigns_deleted integer; v_result jsonb;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  WITH deleted AS (DELETE FROM public.ghl_contacts_raw WHERE fetched_at < NOW() - INTERVAL '30 days' RETURNING id) SELECT COUNT(*) INTO v_ghl_deleted FROM deleted;
  WITH deleted AS (DELETE FROM public.manychat_contacts_raw WHERE fetched_at < NOW() - INTERVAL '30 days' RETURNING id) SELECT COUNT(*) INTO v_manychat_deleted FROM deleted;
  WITH deleted AS (DELETE FROM public.sync_runs WHERE status IN ('completed', 'failed', 'error', 'cancelled') AND started_at < NOW() - INTERVAL '14 days' RETURNING id) SELECT COUNT(*) INTO v_sync_runs_deleted FROM deleted;
  WITH deleted AS (DELETE FROM public.client_events WHERE created_at < NOW() - INTERVAL '90 days' RETURNING id) SELECT COUNT(*) INTO v_events_deleted FROM deleted;
  WITH deleted AS (DELETE FROM public.campaign_executions WHERE created_at < NOW() - INTERVAL '60 days' RETURNING id) SELECT COUNT(*) INTO v_campaigns_deleted FROM deleted;
  v_result := jsonb_build_object('ghl_contacts_deleted', v_ghl_deleted, 'manychat_contacts_deleted', v_manychat_deleted, 'sync_runs_deleted', v_sync_runs_deleted, 'client_events_deleted', v_events_deleted, 'campaign_executions_deleted', v_campaigns_deleted, 'executed_at', NOW());
  RETURN v_result;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_data() TO authenticated, service_role;

-- get_subscription_metrics
DROP FUNCTION IF EXISTS public.get_subscription_metrics();
CREATE OR REPLACE FUNCTION public.get_subscription_metrics()
RETURNS TABLE(total_count bigint, active_count bigint, trialing_count bigint, past_due_count bigint, unpaid_count bigint, canceled_count bigint, paused_count bigint, incomplete_count bigint, mrr bigint, at_risk_amount bigint, stripe_count bigint, paypal_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT COUNT(*)::bigint, COUNT(*) FILTER (WHERE status = 'active')::bigint, COUNT(*) FILTER (WHERE status = 'trialing')::bigint, COUNT(*) FILTER (WHERE status = 'past_due')::bigint, COUNT(*) FILTER (WHERE status = 'unpaid')::bigint, COUNT(*) FILTER (WHERE status IN ('canceled', 'cancelled'))::bigint, COUNT(*) FILTER (WHERE status = 'paused')::bigint, COUNT(*) FILTER (WHERE status LIKE 'incomplete%')::bigint, COALESCE(SUM(amount) FILTER (WHERE status = 'active'), 0)::bigint, COALESCE(SUM(amount) FILTER (WHERE status IN ('past_due', 'unpaid')), 0)::bigint, COUNT(*) FILTER (WHERE COALESCE(provider, 'stripe') = 'stripe')::bigint, COUNT(*) FILTER (WHERE provider = 'paypal')::bigint FROM public.subscriptions;
END;
$function$;

-- get_revenue_by_plan
DROP FUNCTION IF EXISTS public.get_revenue_by_plan(int);
CREATE OR REPLACE FUNCTION public.get_revenue_by_plan(limit_count int DEFAULT 10)
RETURNS TABLE(plan_name text, subscription_count bigint, total_revenue bigint, percentage numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE total_mrr bigint;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO total_mrr FROM public.subscriptions WHERE status IN ('active', 'trialing');
  RETURN QUERY SELECT s.plan_name, COUNT(*)::bigint, SUM(s.amount)::bigint, CASE WHEN total_mrr > 0 THEN ROUND((SUM(s.amount)::numeric / total_mrr::numeric) * 100, 2) ELSE 0 END FROM public.subscriptions s WHERE s.status IN ('active', 'trialing') GROUP BY s.plan_name ORDER BY total_revenue DESC LIMIT limit_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_subscription_metrics() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_revenue_by_plan(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_subscription_metrics() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_revenue_by_plan(integer) TO authenticated, service_role;

-- get_revenue_pipeline_stats (3-param version)
DROP FUNCTION IF EXISTS public.get_revenue_pipeline_stats(TEXT, INT, INT);
CREATE OR REPLACE FUNCTION public.get_revenue_pipeline_stats(p_type TEXT DEFAULT 'recovery', p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_result JSONB; v_total_debt NUMERIC := 0; v_total_trials_expiring NUMERIC := 0; v_total_winback NUMERIC := 0;
  v_recovery_count INT := 0; v_trial_count INT := 0; v_winback_count INT := 0; v_items JSONB;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT COUNT(DISTINCT c.id), COALESCE(SUM(DISTINCT rq.amount_due), 0) / 100.0 INTO v_recovery_count, v_total_debt FROM clients c INNER JOIN recovery_queue rq ON rq.client_id = c.id WHERE rq.status IN ('pending', 'retry_scheduled', 'notified');
  SELECT COUNT(DISTINCT s.id), COALESCE(SUM(s.amount), 0) / 100.0 INTO v_trial_count, v_total_trials_expiring FROM subscriptions s WHERE s.status = 'trialing' AND s.trial_end IS NOT NULL AND s.trial_end BETWEEN NOW() AND NOW() + INTERVAL '3 days';
  SELECT COUNT(*), COALESCE(SUM(total_spend), 0) / 100.0 INTO v_winback_count, v_total_winback FROM clients WHERE lifecycle_stage = 'CHURN';

  IF p_type = 'recovery' THEN
    SELECT jsonb_agg(row_to_json(r)) INTO v_items FROM (SELECT c.id, c.email, c.full_name, c.phone, c.phone_e164, c.lifecycle_stage, c.revenue_score, c.total_spend, rq.amount_due / 100.0 AS revenue_at_risk, rq.status AS queue_status, rq.retry_at, rq.attempt_count, rq.last_attempt_at, rq.notification_sent_at, 'recovery' AS pipeline_type, (SELECT MAX(ce.created_at) FROM client_events ce WHERE ce.client_id = c.id AND ce.event_type = 'custom') AS last_contact_at FROM clients c INNER JOIN recovery_queue rq ON rq.client_id = c.id WHERE rq.status IN ('pending', 'retry_scheduled', 'notified') ORDER BY rq.amount_due DESC LIMIT p_limit OFFSET p_offset) r;
  ELSIF p_type = 'trial' THEN
    SELECT jsonb_agg(row_to_json(r)) INTO v_items FROM (SELECT c.id, c.email, c.full_name, c.phone, c.phone_e164, c.lifecycle_stage, c.revenue_score, c.total_spend, s.amount / 100.0 AS revenue_at_risk, s.trial_end, EXTRACT(EPOCH FROM (s.trial_end - NOW())) / 86400 AS days_until_expiry, NULL::TEXT AS queue_status, 'trial_expiring' AS pipeline_type, (SELECT MAX(ce.created_at) FROM client_events ce WHERE ce.client_id = c.id AND ce.event_type = 'custom') AS last_contact_at FROM subscriptions s INNER JOIN clients c ON c.stripe_customer_id = s.stripe_customer_id OR c.email = s.customer_email WHERE s.status = 'trialing' AND s.trial_end IS NOT NULL AND s.trial_end BETWEEN NOW() AND NOW() + INTERVAL '3 days' ORDER BY s.trial_end ASC LIMIT p_limit OFFSET p_offset) r;
  ELSIF p_type = 'winback' THEN
    SELECT jsonb_agg(row_to_json(r)) INTO v_items FROM (SELECT c.id, c.email, c.full_name, c.phone, c.phone_e164, c.lifecycle_stage, c.revenue_score, c.total_spend / 100.0 AS revenue_at_risk, NULL::TEXT AS queue_status, 'winback' AS pipeline_type, (SELECT MAX(ce.created_at) FROM client_events ce WHERE ce.client_id = c.id AND ce.event_type = 'custom') AS last_contact_at FROM clients c WHERE c.lifecycle_stage = 'CHURN' ORDER BY c.total_spend DESC NULLS LAST LIMIT p_limit OFFSET p_offset) r;
  END IF;

  v_result := jsonb_build_object('summary', jsonb_build_object('total_debt', v_total_debt, 'total_trials_expiring', v_total_trials_expiring, 'total_winback', v_total_winback, 'recovery_count', v_recovery_count, 'trial_count', v_trial_count, 'winback_count', v_winback_count), 'items', COALESCE(v_items, '[]'::jsonb), 'pagination', jsonb_build_object('limit', p_limit, 'offset', p_offset, 'total', CASE p_type WHEN 'recovery' THEN v_recovery_count WHEN 'trial' THEN v_trial_count WHEN 'winback' THEN v_winback_count ELSE 0 END));
  RETURN v_result;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.get_revenue_pipeline_stats(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_revenue_pipeline_stats(TEXT, INT, INT) TO authenticated, service_role;

-- kpi_sales
DROP FUNCTION IF EXISTS public.kpi_sales(text, text, text);
CREATE OR REPLACE FUNCTION public.kpi_sales(p_range text DEFAULT 'today', p_start_date text DEFAULT NULL, p_end_date text DEFAULT NULL)
RETURNS TABLE(currency text, total_amount bigint, transaction_count bigint, avg_amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_start timestamptz; v_end timestamptz; v_tz text := 'America/Mexico_City';
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN v_start := (p_start_date || ' 00:00:00')::timestamp AT TIME ZONE v_tz; v_end := (p_end_date || ' 23:59:59')::timestamp AT TIME ZONE v_tz;
  ELSIF p_range = 'today' THEN v_start := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz; v_end := v_start + INTERVAL '1 day';
  ELSIF p_range = '7d' THEN v_end := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz + INTERVAL '1 day'; v_start := v_end - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN v_start := DATE_TRUNC('month', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz; v_end := v_start + INTERVAL '1 month';
  ELSE v_start := '1970-01-01'::timestamptz; v_end := NOW() + INTERVAL '1 day'; END IF;
  RETURN QUERY SELECT COALESCE(t.currency, 'usd')::text, COALESCE(SUM(t.amount), 0)::bigint, COUNT(*)::bigint, COALESCE(AVG(t.amount), 0)::numeric FROM transactions t WHERE t.status IN ('paid', 'succeeded') AND t.stripe_created_at >= v_start AND t.stripe_created_at < v_end GROUP BY t.currency;
END;
$$;

-- kpi_new_customers
DROP FUNCTION IF EXISTS public.kpi_new_customers(text, text, text);
CREATE OR REPLACE FUNCTION public.kpi_new_customers(p_range text DEFAULT 'today', p_start_date text DEFAULT NULL, p_end_date text DEFAULT NULL)
RETURNS TABLE(currency text, new_customer_count bigint, total_revenue bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_start timestamptz; v_end timestamptz; v_tz text := 'America/Mexico_City';
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN v_start := (p_start_date || ' 00:00:00')::timestamp AT TIME ZONE v_tz; v_end := (p_end_date || ' 23:59:59')::timestamp AT TIME ZONE v_tz;
  ELSIF p_range = 'today' THEN v_start := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz; v_end := v_start + INTERVAL '1 day';
  ELSIF p_range = '7d' THEN v_end := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz + INTERVAL '1 day'; v_start := v_end - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN v_start := DATE_TRUNC('month', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz; v_end := v_start + INTERVAL '1 month';
  ELSE v_start := '1970-01-01'::timestamptz; v_end := NOW() + INTERVAL '1 day'; END IF;
  RETURN QUERY WITH first_payments AS (SELECT DISTINCT ON (LOWER(t.customer_email), COALESCE(t.currency, 'usd')) LOWER(t.customer_email) AS customer_email, COALESCE(t.currency, 'usd')::text AS currency, t.stripe_created_at AS first_payment_date, t.amount AS first_amount FROM transactions t WHERE t.status IN ('paid', 'succeeded') AND t.customer_email IS NOT NULL AND t.stripe_created_at IS NOT NULL ORDER BY LOWER(t.customer_email), COALESCE(t.currency, 'usd'), t.stripe_created_at ASC) SELECT fp.currency, COUNT(*)::bigint, COALESCE(SUM(fp.first_amount), 0)::bigint FROM first_payments fp WHERE fp.first_payment_date >= v_start AND fp.first_payment_date < v_end GROUP BY fp.currency;
END;
$$;

-- kpi_renewals
DROP FUNCTION IF EXISTS public.kpi_renewals(text, text, text);
CREATE OR REPLACE FUNCTION public.kpi_renewals(p_range text DEFAULT 'today', p_start_date text DEFAULT NULL, p_end_date text DEFAULT NULL)
RETURNS TABLE(currency text, renewal_count bigint, total_revenue bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_start timestamptz; v_end timestamptz; v_tz text := 'America/Mexico_City';
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL THEN v_start := (p_start_date || ' 00:00:00')::timestamp AT TIME ZONE v_tz; v_end := (p_end_date || ' 23:59:59')::timestamp AT TIME ZONE v_tz;
  ELSIF p_range = 'today' THEN v_start := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz; v_end := v_start + INTERVAL '1 day';
  ELSIF p_range = '7d' THEN v_end := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz + INTERVAL '1 day'; v_start := v_end - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN v_start := DATE_TRUNC('month', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz; v_end := v_start + INTERVAL '1 month';
  ELSE v_start := '1970-01-01'::timestamptz; v_end := NOW() + INTERVAL '1 day'; END IF;
  RETURN QUERY WITH first_payments AS (SELECT LOWER(t.customer_email) AS customer_email, MIN(t.stripe_created_at) AS first_date FROM transactions t WHERE t.status IN ('paid', 'succeeded') AND t.customer_email IS NOT NULL AND t.stripe_created_at IS NOT NULL GROUP BY LOWER(t.customer_email)), renewals AS (SELECT COALESCE(t.currency, 'usd')::text AS currency, t.amount FROM transactions t INNER JOIN first_payments fp ON LOWER(t.customer_email) = fp.customer_email WHERE t.status IN ('paid', 'succeeded') AND t.stripe_created_at >= v_start AND t.stripe_created_at < v_end AND t.stripe_created_at > fp.first_date) SELECT r.currency, COUNT(*)::bigint, COALESCE(SUM(r.amount), 0)::bigint FROM renewals r GROUP BY r.currency;
END;
$$;

-- kpi_trials_started
DROP FUNCTION IF EXISTS public.kpi_trials_started(text);
CREATE OR REPLACE FUNCTION public.kpi_trials_started(p_range text DEFAULT 'today')
RETURNS TABLE(trial_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_start timestamptz; v_end timestamptz; v_tz text := 'America/Mexico_City';
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_range = 'today' THEN v_start := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz; v_end := v_start + INTERVAL '1 day';
  ELSIF p_range = '7d' THEN v_end := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz + INTERVAL '1 day'; v_start := v_end - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN v_start := DATE_TRUNC('month', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz; v_end := v_start + INTERVAL '1 month';
  ELSE v_start := '1970-01-01'::timestamptz; v_end := NOW() + INTERVAL '1 day'; END IF;
  RETURN QUERY SELECT COUNT(*)::bigint FROM subscriptions s WHERE s.trial_start IS NOT NULL AND s.trial_start >= v_start AND s.trial_start < v_end;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kpi_sales(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kpi_new_customers(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kpi_renewals(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kpi_trials_started(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kpi_sales(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kpi_new_customers(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kpi_renewals(text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kpi_trials_started(text) TO authenticated, service_role;

-- kpi_cancellations
DROP FUNCTION IF EXISTS public.kpi_cancellations(text);
CREATE OR REPLACE FUNCTION public.kpi_cancellations(p_range text DEFAULT 'today')
RETURNS TABLE(currency text, cancellation_count bigint, lost_mrr bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_start timestamptz; v_end timestamptz; v_tz text := 'America/Mexico_City';
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_range = 'today' THEN v_start := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz; v_end := v_start + INTERVAL '1 day';
  ELSIF p_range = '7d' THEN v_end := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz + INTERVAL '1 day'; v_start := v_end - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN v_start := DATE_TRUNC('month', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz; v_end := v_start + INTERVAL '1 month';
  ELSE v_start := '1970-01-01'::timestamptz; v_end := NOW() + INTERVAL '1 day'; END IF;
  RETURN QUERY SELECT COALESCE(s.currency, 'usd')::text, COUNT(*)::bigint, COALESCE(SUM(s.amount), 0)::bigint FROM subscriptions s WHERE s.status = 'canceled' AND s.canceled_at >= v_start AND s.canceled_at < v_end GROUP BY s.currency;
END;
$$;

-- kpi_trial_to_paid
DROP FUNCTION IF EXISTS public.kpi_trial_to_paid(text);
CREATE OR REPLACE FUNCTION public.kpi_trial_to_paid(p_range text DEFAULT 'today')
RETURNS TABLE(conversion_count bigint, conversion_rate numeric, total_revenue bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_start timestamptz; v_end timestamptz; v_tz text := 'America/Mexico_City'; v_total_trials bigint; v_conversions bigint; v_revenue bigint;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_range = 'today' THEN v_start := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz; v_end := v_start + INTERVAL '1 day';
  ELSIF p_range = '7d' THEN v_end := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz + INTERVAL '1 day'; v_start := v_end - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN v_start := DATE_TRUNC('month', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz; v_end := v_start + INTERVAL '1 month';
  ELSE v_start := '1970-01-01'::timestamptz; v_end := NOW() + INTERVAL '1 day'; END IF;
  SELECT COUNT(*), COALESCE(SUM(s.amount), 0) INTO v_conversions, v_revenue FROM subscriptions s WHERE s.trial_end IS NOT NULL AND s.status IN ('active', 'paid') AND s.trial_end >= v_start AND s.trial_end < v_end;
  SELECT COUNT(*) INTO v_total_trials FROM subscriptions s WHERE s.trial_start >= v_start AND s.trial_start < v_end;
  RETURN QUERY SELECT COALESCE(v_conversions, 0)::bigint, CASE WHEN v_total_trials > 0 THEN (v_conversions::numeric / v_total_trials * 100) ELSE 0 END, COALESCE(v_revenue, 0)::bigint;
END;
$$;

-- kpi_refunds
DROP FUNCTION IF EXISTS public.kpi_refunds(text);
CREATE OR REPLACE FUNCTION public.kpi_refunds(p_range text DEFAULT 'today')
RETURNS TABLE(currency text, refund_count bigint, refund_amount bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_start timestamptz; v_end timestamptz; v_tz text := 'America/Mexico_City';
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF p_range = 'today' THEN v_start := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz; v_end := v_start + INTERVAL '1 day';
  ELSIF p_range = '7d' THEN v_end := DATE_TRUNC('day', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz + INTERVAL '1 day'; v_start := v_end - INTERVAL '7 days';
  ELSIF p_range = 'month' THEN v_start := DATE_TRUNC('month', NOW() AT TIME ZONE v_tz) AT TIME ZONE v_tz; v_end := v_start + INTERVAL '1 month';
  ELSE v_start := '1970-01-01'::timestamptz; v_end := NOW() + INTERVAL '1 day'; END IF;
  RETURN QUERY SELECT COALESCE(t.currency, 'usd')::text, COUNT(*)::bigint, COALESCE(SUM(ABS(t.amount)), 0)::bigint FROM transactions t WHERE t.status = 'refunded' AND t.stripe_created_at >= v_start AND t.stripe_created_at < v_end GROUP BY t.currency;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.kpi_refunds(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kpi_trial_to_paid(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kpi_cancellations(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kpi_refunds(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kpi_trial_to_paid(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.kpi_cancellations(text) TO authenticated, service_role;