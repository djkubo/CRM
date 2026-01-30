-- ========================================
-- SECURITY HARDENING MIGRATION
-- ========================================

-- FASE 2: Arreglar políticas RLS permisivas

-- payment_update_links: quitar acceso público
DROP POLICY IF EXISTS "Public can validate own token" ON public.payment_update_links;

-- Solo admin puede ver/gestionar tokens
CREATE POLICY "Admin full access payment_update_links" ON public.payment_update_links
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Service role para edge functions
CREATE POLICY "Service role payment_update_links" ON public.payment_update_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Revocar acceso anónimo
REVOKE ALL ON TABLE public.payment_update_links FROM anon;

-- scheduled_messages: quitar acceso público
DROP POLICY IF EXISTS "Anyone can view scheduled messages" ON public.scheduled_messages;

CREATE POLICY "Admin can manage scheduled_messages" ON public.scheduled_messages
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Service role scheduled_messages" ON public.scheduled_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Revocar acceso anónimo
REVOKE ALL ON TABLE public.scheduled_messages FROM anon;

-- ========================================
-- FASE 3: Agregar search_path a funciones vulnerables
-- ========================================

ALTER FUNCTION public.cleanup_old_financial_data() SET search_path = public;
ALTER FUNCTION public.get_staging_counts_accurate() SET search_path = public;
ALTER FUNCTION public.kpi_invoices_at_risk() SET search_path = public;
ALTER FUNCTION public.kpi_invoices_summary() SET search_path = public;
ALTER FUNCTION public.kpi_mrr_summary() SET search_path = public;
ALTER FUNCTION public.refresh_lifecycle_counts() SET search_path = public;
ALTER FUNCTION public.update_recovery_queue_updated_at() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- ========================================
-- FASE 4: Proteger vistas materializadas
-- ========================================

REVOKE ALL ON public.mv_client_lifecycle_counts FROM anon;
REVOKE ALL ON public.mv_sales_summary FROM anon;
GRANT SELECT ON public.mv_client_lifecycle_counts TO authenticated;
GRANT SELECT ON public.mv_sales_summary TO authenticated;