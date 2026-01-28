-- Corregir search_path para la función de conteos rápidos
DROP FUNCTION IF EXISTS public.get_staging_counts_fast();

CREATE OR REPLACE FUNCTION public.get_staging_counts_fast()
RETURNS JSON
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT json_build_object(
    'ghl_total', COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'ghl_contacts_raw'), 0),
    'ghl_unprocessed', COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'ghl_contacts_raw'), 0),
    'manychat_total', COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'manychat_contacts_raw'), 0),
    'manychat_unprocessed', COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'manychat_contacts_raw'), 0),
    'csv_total', COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'csv_imports_raw'), 0),
    'csv_staged', COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'csv_imports_raw'), 0),
    'clients_total', COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'clients'), 0),
    'transactions_total', COALESCE((SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'transactions'), 0)
  );
$$;