-- Admin-only "Client 360" RPC: returns unified data across sources for a single client.
-- This avoids doing many client-side joins and provides a single place to refine matching logic.

-- Helpful indexes for identity-based lookups (safe IF NOT EXISTS).
CREATE INDEX IF NOT EXISTS idx_disputes_customer_id
ON public.disputes(customer_id)
WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_paypal_subscriptions_payer_id
ON public.paypal_subscriptions(payer_id)
WHERE payer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_contact_id
ON public.scheduled_messages(contact_id);

CREATE OR REPLACE FUNCTION public.get_client_360(
  p_client_id uuid,
  p_limits jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET statement_timeout TO '12s'
SET search_path TO 'public'
AS $function$
DECLARE
  v_client public.clients%ROWTYPE;

  v_emails text[] := ARRAY[]::text[];
  v_phone_e164s text[] := ARRAY[]::text[];
  v_stripe_ids text[] := ARRAY[]::text[];
  v_paypal_ids text[] := ARRAY[]::text[];
  v_ghl_ids text[] := ARRAY[]::text[];
  v_manychat_ids text[] := ARRAY[]::text[];
  v_contact_ids text[] := ARRAY[]::text[];

  v_transactions_limit int := COALESCE((p_limits->>'transactions')::int, 500);
  v_invoices_limit int := COALESCE((p_limits->>'invoices')::int, 200);
  v_subscriptions_limit int := COALESCE((p_limits->>'subscriptions')::int, 200);
  v_disputes_limit int := COALESCE((p_limits->>'disputes')::int, 200);
  v_paypal_subscriptions_limit int := COALESCE((p_limits->>'paypal_subscriptions')::int, 200);
  v_messages_limit int := COALESCE((p_limits->>'messages')::int, 200);
  v_client_events_limit int := COALESCE((p_limits->>'client_events')::int, 200);
  v_lead_events_limit int := COALESCE((p_limits->>'lead_events')::int, 200);
  v_conversations_limit int := COALESCE((p_limits->>'conversations')::int, 100);
  v_chat_events_limit int := COALESCE((p_limits->>'chat_events')::int, 500);
  v_scheduled_messages_limit int := COALESCE((p_limits->>'scheduled_messages')::int, 200);
  v_flow_executions_limit int := COALESCE((p_limits->>'flow_executions')::int, 200);
  v_merge_conflicts_limit int := COALESCE((p_limits->>'merge_conflicts')::int, 200);

  v_transactions jsonb := '[]'::jsonb;
  v_invoices jsonb := '[]'::jsonb;
  v_subscriptions jsonb := '[]'::jsonb;
  v_disputes jsonb := '[]'::jsonb;
  v_paypal_subscriptions jsonb := '[]'::jsonb;
  v_messages jsonb := '[]'::jsonb;
  v_client_events jsonb := '[]'::jsonb;
  v_lead_events jsonb := '[]'::jsonb;
  v_conversations jsonb := '[]'::jsonb;
  v_chat_events jsonb := '[]'::jsonb;
  v_scheduled_messages jsonb := '[]'::jsonb;
  v_flow_executions jsonb := '[]'::jsonb;
  v_merge_conflicts jsonb := '[]'::jsonb;
  v_identities jsonb := '[]'::jsonb;

  v_transactions_count bigint := 0;
  v_invoices_count bigint := 0;
  v_subscriptions_count bigint := 0;
  v_disputes_count bigint := 0;
  v_paypal_subscriptions_count bigint := 0;
  v_messages_count bigint := 0;
  v_client_events_count bigint := 0;
  v_lead_events_count bigint := 0;
  v_conversations_count bigint := 0;
  v_chat_events_count bigint := 0;
  v_scheduled_messages_count bigint := 0;
  v_flow_executions_count bigint := 0;
  v_merge_conflicts_count bigint := 0;

  v_ltv_paid_cents bigint := 0;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_client
  FROM public.clients
  WHERE id = p_client_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'client not found', 'client_id', p_client_id);
  END IF;

  -- Consolidate identity sets (use client row + contact_identities).
  SELECT COALESCE(array_agg(DISTINCT e), ARRAY[]::text[]) INTO v_emails
  FROM (
    SELECT public.normalize_email(v_client.email) AS e
    UNION ALL
    SELECT ci.email_normalized AS e
    FROM public.contact_identities ci
    WHERE ci.client_id = p_client_id
      AND ci.email_normalized IS NOT NULL
  ) s
  WHERE e IS NOT NULL;

  SELECT COALESCE(array_agg(DISTINCT p), ARRAY[]::text[]) INTO v_phone_e164s
  FROM (
    SELECT COALESCE(v_client.phone_e164, public.normalize_phone_e164(v_client.phone)) AS p
    UNION ALL
    SELECT ci.phone_e164 AS p
    FROM public.contact_identities ci
    WHERE ci.client_id = p_client_id
      AND ci.phone_e164 IS NOT NULL
  ) s
  WHERE p IS NOT NULL;

  SELECT COALESCE(array_agg(DISTINCT external_id), ARRAY[]::text[]) INTO v_stripe_ids
  FROM public.contact_identities
  WHERE client_id = p_client_id
    AND source = 'stripe';
  v_stripe_ids := array_remove(array_cat(v_stripe_ids, ARRAY[v_client.stripe_customer_id]), NULL);

  SELECT COALESCE(array_agg(DISTINCT external_id), ARRAY[]::text[]) INTO v_paypal_ids
  FROM public.contact_identities
  WHERE client_id = p_client_id
    AND source = 'paypal';
  v_paypal_ids := array_remove(array_cat(v_paypal_ids, ARRAY[v_client.paypal_customer_id]), NULL);

  SELECT COALESCE(array_agg(DISTINCT external_id), ARRAY[]::text[]) INTO v_ghl_ids
  FROM public.contact_identities
  WHERE client_id = p_client_id
    AND source = 'ghl';
  v_ghl_ids := array_remove(array_cat(v_ghl_ids, ARRAY[v_client.ghl_contact_id]), NULL);

  SELECT COALESCE(array_agg(DISTINCT external_id), ARRAY[]::text[]) INTO v_manychat_ids
  FROM public.contact_identities
  WHERE client_id = p_client_id
    AND source = 'manychat';
  v_manychat_ids := array_remove(array_cat(v_manychat_ids, ARRAY[v_client.manychat_subscriber_id]), NULL);

  v_contact_ids := array_cat(v_ghl_ids, v_manychat_ids);

  -- contact_identities rows (for debugging/visibility)
  SELECT COALESCE(jsonb_agg(to_jsonb(ci) ORDER BY ci.updated_at DESC), '[]'::jsonb) INTO v_identities
  FROM public.contact_identities ci
  WHERE ci.client_id = p_client_id;

  -- ======================
  -- Financial data
  -- ======================
  SELECT COUNT(*) INTO v_transactions_count
  FROM public.transactions t
  WHERE (
    (cardinality(v_stripe_ids) > 0 AND t.stripe_customer_id = ANY(v_stripe_ids))
    OR (cardinality(v_emails) > 0 AND t.customer_email = ANY(v_emails))
  );

  SELECT COALESCE(SUM(t.amount) FILTER (WHERE t.status IN ('paid', 'succeeded')), 0) INTO v_ltv_paid_cents
  FROM public.transactions t
  WHERE (
    (cardinality(v_stripe_ids) > 0 AND t.stripe_customer_id = ANY(v_stripe_ids))
    OR (cardinality(v_emails) > 0 AND t.customer_email = ANY(v_emails))
  );

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY COALESCE(t.stripe_created_at, t.created_at) DESC NULLS LAST), '[]'::jsonb)
  INTO v_transactions
  FROM (
    SELECT *
    FROM public.transactions
    WHERE (
      (cardinality(v_stripe_ids) > 0 AND stripe_customer_id = ANY(v_stripe_ids))
      OR (cardinality(v_emails) > 0 AND customer_email = ANY(v_emails))
    )
    ORDER BY COALESCE(stripe_created_at, created_at) DESC NULLS LAST
    LIMIT v_transactions_limit
  ) t;

  SELECT COUNT(*) INTO v_invoices_count
  FROM public.invoices i
  WHERE (
    i.client_id = p_client_id
    OR (cardinality(v_stripe_ids) > 0 AND i.stripe_customer_id = ANY(v_stripe_ids))
    OR (cardinality(v_emails) > 0 AND i.customer_email = ANY(v_emails))
  );

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY COALESCE(i.stripe_created_at, i.created_at) DESC NULLS LAST), '[]'::jsonb)
  INTO v_invoices
  FROM (
    SELECT *
    FROM public.invoices
    WHERE (
      client_id = p_client_id
      OR (cardinality(v_stripe_ids) > 0 AND stripe_customer_id = ANY(v_stripe_ids))
      OR (cardinality(v_emails) > 0 AND customer_email = ANY(v_emails))
    )
    ORDER BY COALESCE(stripe_created_at, created_at) DESC NULLS LAST
    LIMIT v_invoices_limit
  ) i;

  SELECT COUNT(*) INTO v_subscriptions_count
  FROM public.subscriptions s
  WHERE (
    (cardinality(v_stripe_ids) > 0 AND s.stripe_customer_id = ANY(v_stripe_ids))
    OR (cardinality(v_emails) > 0 AND s.customer_email = ANY(v_emails))
  );

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY COALESCE(s.current_period_end, s.updated_at, s.created_at) DESC NULLS LAST), '[]'::jsonb)
  INTO v_subscriptions
  FROM (
    SELECT *
    FROM public.subscriptions
    WHERE (
      (cardinality(v_stripe_ids) > 0 AND stripe_customer_id = ANY(v_stripe_ids))
      OR (cardinality(v_emails) > 0 AND customer_email = ANY(v_emails))
    )
    ORDER BY COALESCE(current_period_end, updated_at, created_at) DESC NULLS LAST
    LIMIT v_subscriptions_limit
  ) s;

  SELECT COUNT(*) INTO v_disputes_count
  FROM public.disputes d
  WHERE (
    (cardinality(v_stripe_ids) > 0 AND d.customer_id = ANY(v_stripe_ids))
    OR (cardinality(v_emails) > 0 AND d.customer_email = ANY(v_emails))
  );

  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY COALESCE(d.created_at_external, d.created_at) DESC NULLS LAST), '[]'::jsonb)
  INTO v_disputes
  FROM (
    SELECT *
    FROM public.disputes
    WHERE (
      (cardinality(v_stripe_ids) > 0 AND customer_id = ANY(v_stripe_ids))
      OR (cardinality(v_emails) > 0 AND customer_email = ANY(v_emails))
    )
    ORDER BY COALESCE(created_at_external, created_at) DESC NULLS LAST
    LIMIT v_disputes_limit
  ) d;

  SELECT COUNT(*) INTO v_paypal_subscriptions_count
  FROM public.paypal_subscriptions ps
  WHERE (
    (cardinality(v_paypal_ids) > 0 AND ps.payer_id = ANY(v_paypal_ids))
    OR (cardinality(v_emails) > 0 AND ps.payer_email = ANY(v_emails))
  );

  SELECT COALESCE(jsonb_agg(to_jsonb(ps) ORDER BY COALESCE(ps.update_time, ps.create_time, ps.created_at) DESC NULLS LAST), '[]'::jsonb)
  INTO v_paypal_subscriptions
  FROM (
    SELECT *
    FROM public.paypal_subscriptions
    WHERE (
      (cardinality(v_paypal_ids) > 0 AND payer_id = ANY(v_paypal_ids))
      OR (cardinality(v_emails) > 0 AND payer_email = ANY(v_emails))
    )
    ORDER BY COALESCE(update_time, create_time, created_at) DESC NULLS LAST
    LIMIT v_paypal_subscriptions_limit
  ) ps;

  -- ======================
  -- Comms / CRM
  -- ======================
  SELECT COUNT(*) INTO v_messages_count
  FROM public.messages m
  WHERE m.client_id = p_client_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_messages
  FROM (
    SELECT *
    FROM public.messages
    WHERE client_id = p_client_id
    ORDER BY created_at DESC NULLS LAST
    LIMIT v_messages_limit
  ) m;

  SELECT COUNT(*) INTO v_client_events_count
  FROM public.client_events ce
  WHERE ce.client_id = p_client_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(ce) ORDER BY ce.created_at DESC), '[]'::jsonb)
  INTO v_client_events
  FROM (
    SELECT *
    FROM public.client_events
    WHERE client_id = p_client_id
    ORDER BY created_at DESC
    LIMIT v_client_events_limit
  ) ce;

  SELECT COUNT(*) INTO v_lead_events_count
  FROM public.lead_events le
  WHERE le.client_id = p_client_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(le) ORDER BY le.processed_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_lead_events
  FROM (
    SELECT *
    FROM public.lead_events
    WHERE client_id = p_client_id
    ORDER BY processed_at DESC NULLS LAST
    LIMIT v_lead_events_limit
  ) le;

  SELECT COUNT(*) INTO v_conversations_count
  FROM public.conversations c
  WHERE (
    (cardinality(v_contact_ids) > 0 AND c.contact_id = ANY(v_contact_ids))
  );

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.updated_at DESC), '[]'::jsonb)
  INTO v_conversations
  FROM (
    SELECT *
    FROM public.conversations
    WHERE (
      (cardinality(v_contact_ids) > 0 AND contact_id = ANY(v_contact_ids))
    )
    ORDER BY updated_at DESC
    LIMIT v_conversations_limit
  ) c;

  SELECT COUNT(*) INTO v_chat_events_count
  FROM public.chat_events e
  WHERE (
    (cardinality(v_contact_ids) > 0 AND e.contact_id = ANY(v_contact_ids))
  );

  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.created_at DESC), '[]'::jsonb)
  INTO v_chat_events
  FROM (
    SELECT *
    FROM public.chat_events
    WHERE (
      (cardinality(v_contact_ids) > 0 AND contact_id = ANY(v_contact_ids))
    )
    ORDER BY created_at DESC
    LIMIT v_chat_events_limit
  ) e;

  SELECT COUNT(*) INTO v_scheduled_messages_count
  FROM public.scheduled_messages sm
  WHERE (
    (cardinality(v_contact_ids) > 0 AND sm.contact_id = ANY(v_contact_ids))
  );

  SELECT COALESCE(jsonb_agg(to_jsonb(sm) ORDER BY sm.scheduled_at DESC), '[]'::jsonb)
  INTO v_scheduled_messages
  FROM (
    SELECT *
    FROM public.scheduled_messages
    WHERE (
      (cardinality(v_contact_ids) > 0 AND contact_id = ANY(v_contact_ids))
    )
    ORDER BY scheduled_at DESC
    LIMIT v_scheduled_messages_limit
  ) sm;

  -- ======================
  -- Automation / Ops
  -- ======================
  SELECT COUNT(*) INTO v_flow_executions_count
  FROM public.flow_executions fe
  WHERE fe.client_id = p_client_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(fe) ORDER BY fe.started_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_flow_executions
  FROM (
    SELECT *
    FROM public.flow_executions
    WHERE client_id = p_client_id
    ORDER BY started_at DESC NULLS LAST
    LIMIT v_flow_executions_limit
  ) fe;

  SELECT COUNT(*) INTO v_merge_conflicts_count
  FROM public.merge_conflicts mc
  WHERE mc.suggested_client_id = p_client_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(mc) ORDER BY mc.created_at DESC), '[]'::jsonb)
  INTO v_merge_conflicts
  FROM (
    SELECT *
    FROM public.merge_conflicts
    WHERE suggested_client_id = p_client_id
    ORDER BY created_at DESC
    LIMIT v_merge_conflicts_limit
  ) mc;

  RETURN jsonb_build_object(
    'success', true,
    'client', to_jsonb(v_client),
    'identities', v_identities,
    'identity_sets', jsonb_build_object(
      'emails', v_emails,
      'phone_e164s', v_phone_e164s,
      'stripe_customer_ids', v_stripe_ids,
      'paypal_customer_ids', v_paypal_ids,
      'ghl_contact_ids', v_ghl_ids,
      'manychat_subscriber_ids', v_manychat_ids,
      'contact_ids', v_contact_ids
    ),
    'metrics', jsonb_build_object(
      'ltv_paid_cents', v_ltv_paid_cents
    ),
    'counts', jsonb_build_object(
      'transactions', v_transactions_count,
      'invoices', v_invoices_count,
      'subscriptions', v_subscriptions_count,
      'disputes', v_disputes_count,
      'paypal_subscriptions', v_paypal_subscriptions_count,
      'messages', v_messages_count,
      'client_events', v_client_events_count,
      'lead_events', v_lead_events_count,
      'conversations', v_conversations_count,
      'chat_events', v_chat_events_count,
      'scheduled_messages', v_scheduled_messages_count,
      'flow_executions', v_flow_executions_count,
      'merge_conflicts', v_merge_conflicts_count
    ),
    'transactions', v_transactions,
    'invoices', v_invoices,
    'subscriptions', v_subscriptions,
    'disputes', v_disputes,
    'paypal_subscriptions', v_paypal_subscriptions,
    'messages', v_messages,
    'client_events', v_client_events,
    'lead_events', v_lead_events,
    'conversations', v_conversations,
    'chat_events', v_chat_events,
    'scheduled_messages', v_scheduled_messages,
    'flow_executions', v_flow_executions,
    'merge_conflicts', v_merge_conflicts
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_client_360(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_client_360(uuid, jsonb) TO authenticated, service_role;

-- Ensure PostgREST picks up the new RPC quickly.
NOTIFY pgrst, 'reload schema';

