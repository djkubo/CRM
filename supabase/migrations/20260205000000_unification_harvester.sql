-- =====================================================
-- HARVESTER: Automate Identity Unification from Raw Data
-- =====================================================

-- Function to scan recent transactions/subscriptions and unify identities
-- This bridges the gap between raw Stripe/PayPal data and the 'clients' CRM table.

CREATE OR REPLACE FUNCTION public.harvest_recent_contacts(
  p_lookback_hours int DEFAULT 72
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_processed int := 0;
  v_created int := 0;
  v_updated int := 0;
  v_errors int := 0;
  v_lookback interval;
  v_result jsonb;
BEGIN
  v_lookback := (p_lookback_hours || ' hours')::interval;

  -- 1. Scan Transactions (Payers)
  FOR v_rec IN (
    SELECT DISTINCT
      customer_email,
      customer_name,
      -- phone is not always in transactions, but we take what we have
      metadata,
      currency,
      payment_type
    FROM transactions
    WHERE created_at >= now() - v_lookback
    AND customer_email IS NOT NULL
  ) LOOP
    BEGIN
      -- We don't have phone here usually, but unification handles email-only updates
      v_result := public.unify_identity(
        p_source => 'transaction', 
        p_email => v_rec.customer_email,
        p_full_name => v_rec.customer_name,
        p_tracking_data => COALESCE(v_rec.metadata, '{}'::jsonb)
      );
      
      IF (v_result->>'success')::boolean THEN
        IF v_result->>'action' = 'created' THEN v_created := v_created + 1;
        ELSE v_updated := v_updated + 1;
        END IF;
      ELSE
         v_errors := v_errors + 1;
      END IF;
      
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  -- 2. Scan Subscriptions (Active Members)
  FOR v_rec IN (
    SELECT DISTINCT
      customer_email,
      -- Subscriptions might have more metadata?
      metadata
    FROM subscriptions
    WHERE created_at >= now() - v_lookback 
       OR updated_at >= now() - v_lookback
    AND customer_email IS NOT NULL
  ) LOOP
    BEGIN
      -- We skip if processed already? unify_identity is idempotent, so it's fine.
      v_result := public.unify_identity(
        p_source => 'subscription', 
        p_email => v_rec.customer_email,
        p_tracking_data => COALESCE(v_rec.metadata, '{}'::jsonb)
      );
      
      IF (v_result->>'success')::boolean THEN
         -- Count stats (might act as update)
         IF v_result->>'action' = 'created' THEN v_created := v_created + 1;
         ELSE v_updated := v_updated + 1;
         END IF;
      END IF;
      
      v_processed := v_processed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'processed', v_processed,
    'created', v_created,
    'updated', v_updated,
    'errors', v_errors
  );
END;
$$;
