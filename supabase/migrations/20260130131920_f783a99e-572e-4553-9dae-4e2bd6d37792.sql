-- ========================================
-- FUNCIONES SIN search_path - SIGNATURES VERIFICADOS
-- ========================================

-- Funciones sin argumentos
ALTER FUNCTION public.cleanup_and_maintain() SET search_path = public;
ALTER FUNCTION public.cleanup_old_data() SET search_path = public;
ALTER FUNCTION public.cleanup_stuck_syncs() SET search_path = public;
ALTER FUNCTION public.dashboard_metrics() SET search_path = public;
ALTER FUNCTION public.data_quality_checks() SET search_path = public;
ALTER FUNCTION public.get_staging_counts_fast() SET search_path = public;
ALTER FUNCTION public.get_system_timezone() SET search_path = public;
ALTER FUNCTION public.normalize_client_email() SET search_path = public;
ALTER FUNCTION public.promote_metrics_staging() SET search_path = public;
ALTER FUNCTION public.rebuild_metrics_staging() SET search_path = public;
ALTER FUNCTION public.refresh_materialized_views() SET search_path = public;
ALTER FUNCTION public.update_broadcast_list_member_count() SET search_path = public;
ALTER FUNCTION public.kpi_churn_30d() SET search_path = public;
ALTER FUNCTION public.kpi_failed_payments() SET search_path = public;
ALTER FUNCTION public.kpi_mrr() SET search_path = public;
ALTER FUNCTION public.kpi_new_customers() SET search_path = public;
ALTER FUNCTION public.kpi_sales_summary() SET search_path = public;

-- Funciones con argumentos específicos
ALTER FUNCTION public.reset_stuck_syncs(integer) SET search_path = public;
ALTER FUNCTION public.kpi_cancellations(text) SET search_path = public;
ALTER FUNCTION public.kpi_refunds(text) SET search_path = public;
ALTER FUNCTION public.kpi_renewals(text, text, text) SET search_path = public;
ALTER FUNCTION public.kpi_sales(text, text, text) SET search_path = public;
ALTER FUNCTION public.kpi_trial_to_paid(text) SET search_path = public;
ALTER FUNCTION public.normalize_email(text) SET search_path = public;
ALTER FUNCTION public.normalize_phone_e164(text) SET search_path = public;
ALTER FUNCTION public.match_knowledge(vector, double precision, integer) SET search_path = public;
ALTER FUNCTION public.merge_contact(text, text, text, text, text, text[], boolean, boolean, boolean, jsonb, boolean, uuid) SET search_path = public;
ALTER FUNCTION public.unify_identity(text, text, text, text, text, text, text, text, text[], jsonb, jsonb) SET search_path = public;
ALTER FUNCTION public.unify_identity_v2(text, text, text, text, text, text, jsonb) SET search_path = public;