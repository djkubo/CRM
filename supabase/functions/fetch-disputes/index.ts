import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Verify admin key
    const adminKey = Deno.env.get("ADMIN_API_KEY");
    const providedKey = req.headers.get("x-admin-key");
    
    if (!adminKey || !providedKey || providedKey !== adminKey) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) {
      return new Response(
        JSON.stringify({ error: 'STRIPE_SECRET_KEY not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let hasMore = true;
    let startingAfter: string | undefined;
    let totalFetched = 0;

    console.log(`[fetch-disputes] Starting sync...`);

    while (hasMore) {
      const params = new URLSearchParams({
        limit: '100',
        expand: ['data.charge', 'data.payment_intent'].join(','),
      });
      if (startingAfter) params.set('starting_after', startingAfter);

      const response = await fetch(`https://api.stripe.com/v1/disputes?${params}`, {
        headers: { 'Authorization': `Bearer ${stripeKey}` },
      });

      if (!response.ok) {
        throw new Error(`Stripe Disputes API error: ${response.status}`);
      }

      const data = await response.json();
      const disputes = data.data || [];

      const batch = disputes.map((d: any) => {
        // Get customer email from charge or payment_intent
        let customerEmail = null;
        let customerId = null;
        
        if (d.charge && typeof d.charge === 'object') {
          customerEmail = d.charge.receipt_email || d.charge.billing_details?.email;
          customerId = d.charge.customer;
        }
        if (d.payment_intent && typeof d.payment_intent === 'object') {
          customerEmail = customerEmail || d.payment_intent.receipt_email;
          customerId = customerId || d.payment_intent.customer;
        }

        return {
          external_dispute_id: d.id,
          source: 'stripe',
          amount: d.amount,
          currency: d.currency || 'usd',
          status: d.status,
          reason: d.reason,
          charge_id: typeof d.charge === 'string' ? d.charge : d.charge?.id,
          payment_intent_id: typeof d.payment_intent === 'string' ? d.payment_intent : d.payment_intent?.id,
          customer_email: customerEmail,
          customer_id: customerId,
          evidence_due_by: d.evidence_details?.due_by ? new Date(d.evidence_details.due_by * 1000).toISOString() : null,
          is_charge_refundable: d.is_charge_refundable,
          has_evidence: d.evidence_details?.has_evidence || false,
          created_at_external: d.created ? new Date(d.created * 1000).toISOString() : null,
          metadata: d.metadata || {},
          synced_at: new Date().toISOString(),
        };
      });

      if (batch.length > 0) {
        const { error } = await supabase
          .from('disputes')
          .upsert(batch, { onConflict: 'external_dispute_id' });

        if (error) console.error(`[fetch-disputes] Upsert error:`, error);
        else totalFetched += batch.length;
      }

      hasMore = data.has_more;
      if (hasMore && disputes.length > 0) {
        startingAfter = disputes[disputes.length - 1].id;
      }

      await new Promise(r => setTimeout(r, 100));
    }

    const duration = Date.now() - startTime;
    console.log(`[fetch-disputes] Complete: ${totalFetched} disputes in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        disputes: totalFetched,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[fetch-disputes] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
