import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
};

interface SyncRequest {
  startDate?: string;
  endDate?: string;
}

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

    let body: SyncRequest = {};
    try {
      body = await req.json();
    } catch {
      // Empty body OK
    }

    let hasMore = true;
    let startingAfter: string | undefined;
    let totalFetched = 0;

    console.log(`[fetch-payouts] Starting sync...`);

    while (hasMore) {
      const params = new URLSearchParams({ limit: '100' });
      if (startingAfter) params.set('starting_after', startingAfter);
      
      // Optional date filters
      if (body.startDate) {
        params.set('created[gte]', Math.floor(new Date(body.startDate).getTime() / 1000).toString());
      }
      if (body.endDate) {
        params.set('created[lte]', Math.floor(new Date(body.endDate).getTime() / 1000).toString());
      }

      const response = await fetch(`https://api.stripe.com/v1/payouts?${params}`, {
        headers: { 'Authorization': `Bearer ${stripeKey}` },
      });

      if (!response.ok) {
        throw new Error(`Stripe Payouts API error: ${response.status}`);
      }

      const data = await response.json();
      const payouts = data.data || [];

      const batch = payouts.map((p: any) => ({
        external_payout_id: p.id,
        source: 'stripe',
        amount: p.amount,
        currency: p.currency || 'usd',
        status: p.status, // pending, in_transit, paid, failed, canceled
        type: p.type, // bank_account, card
        method: p.method, // standard, instant
        description: p.description,
        destination: p.destination,
        failure_code: p.failure_code,
        failure_message: p.failure_message,
        arrival_date: p.arrival_date ? new Date(p.arrival_date * 1000).toISOString() : null,
        created_at_external: p.created ? new Date(p.created * 1000).toISOString() : null,
        metadata: p.metadata || {},
        synced_at: new Date().toISOString(),
      }));

      if (batch.length > 0) {
        const { error } = await supabase
          .from('payouts')
          .upsert(batch, { onConflict: 'external_payout_id' });

        if (error) console.error(`[fetch-payouts] Upsert error:`, error);
        else totalFetched += batch.length;
      }

      hasMore = data.has_more;
      if (hasMore && payouts.length > 0) {
        startingAfter = payouts[payouts.length - 1].id;
      }

      await new Promise(r => setTimeout(r, 100));
    }

    const duration = Date.now() - startTime;
    console.log(`[fetch-payouts] Complete: ${totalFetched} payouts in ${duration}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        payouts: totalFetched,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[fetch-payouts] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
