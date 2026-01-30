-- ========================================
-- PROTEGER VISTAS
-- ========================================

-- Revocar acceso anónimo a la vista clients_with_staging
REVOKE ALL ON public.clients_with_staging FROM anon;
GRANT SELECT ON public.clients_with_staging TO authenticated;

-- Asegurar que solo usuarios autenticados pueden usar las vistas materializadas
REVOKE ALL ON public.mv_client_lifecycle_counts FROM anon;
REVOKE ALL ON public.mv_sales_summary FROM anon;

-- Agregar política a chat_events para service role insert (para edge functions)
DROP POLICY IF EXISTS "Admin full access chat_events" ON public.chat_events;
CREATE POLICY "Admin full access chat_events" ON public.chat_events
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());