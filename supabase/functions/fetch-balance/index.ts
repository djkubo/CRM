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
    const paypalClientId = Deno.env.get('PAYPAL_CLIENT_ID');
    const paypalSecret = Deno.env.get('PAYPAL_SECRET');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const snapshots = [];

    // ========== STRIPE BALANCE ==========
    if (stripeKey) {
      console.log(`[fetch-balance] Fetching Stripe balance...`);

      const response = await fetch('https://api.stripe.com/v1/balance', {
        headers: { 'Authorization': `Bearer ${stripeKey}` },
      });

      if (response.ok) {
        const balance = await response.json();
        
        // Process each currency
        for (const avail of balance.available || []) {
          const pending = (balance.pending || []).find((p: any) => p.currency === avail.currency);
          const instantAvailable = (balance.instant_available || []).find((i: any) => i.currency === avail.currency);
          const connectReserved = (balance.connect_reserved || []).find((c: any) => c.currency === avail.currency);

          snapshots.push({
            source: 'stripe',
            available_amount: avail.amount || 0,
            pending_amount: pending?.amount || 0,
            currency: avail.currency,
            instant_available: instantAvailable?.amount || 0,
            connect_reserved: connectReserved?.amount || 0,
            details: {
              available: avail,
              pending,
              instant_available: instantAvailable,
              connect_reserved: connectReserved,
              livemode: balance.livemode,
            },
            snapshot_at: new Date().toISOString(),
          });
        }

        console.log(`[fetch-balance] Stripe: ${snapshots.length} currency balances`);
      } else {
        console.error(`[fetch-balance] Stripe balance error: ${response.status}`);
      }
    }

    // ========== PAYPAL BALANCE ==========
    if (paypalClientId && paypalSecret) {
      console.log(`[fetch-balance] Fetching PayPal balance...`);

      // Get PayPal access token
      const authResponse = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${paypalClientId}:${paypalSecret}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });

      if (authResponse.ok) {
        const authData = await authResponse.json();
        const accessToken = authData.access_token;

        // Get balance
        const balanceResponse = await fetch('https://api-m.paypal.com/v1/reporting/balances', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        if (balanceResponse.ok) {
          const balanceData = await balanceResponse.json();
          
          for (const balance of balanceData.balances || []) {
            snapshots.push({
              source: 'paypal',
              available_amount: Math.round(parseFloat(balance.available_balance?.value || '0') * 100),
              pending_amount: Math.round(parseFloat(balance.withheld_balance?.value || '0') * 100),
              currency: balance.currency,
              instant_available: 0,
              connect_reserved: 0,
              details: balance,
              snapshot_at: new Date().toISOString(),
            });
          }

          console.log(`[fetch-balance] PayPal: ${balanceData.balances?.length || 0} currency balances`);
        } else {
          console.error(`[fetch-balance] PayPal balance error: ${balanceResponse.status}`);
        }
      }
    }

    // Insert snapshots
    if (snapshots.length > 0) {
      const { error } = await supabase
        .from('balance_snapshots')
        .insert(snapshots);

      if (error) {
        console.error(`[fetch-balance] Insert error:`, error);
      }
    }

    const duration = Date.now() - startTime;

    // Return current balances
    const stripeBalances = snapshots.filter(s => s.source === 'stripe');
    const paypalBalances = snapshots.filter(s => s.source === 'paypal');

    return new Response(
      JSON.stringify({
        success: true,
        stripe: stripeBalances.map(b => ({
          currency: b.currency,
          available: b.available_amount / 100,
          pending: b.pending_amount / 100,
        })),
        paypal: paypalBalances.map(b => ({
          currency: b.currency,
          available: b.available_amount / 100,
          pending: b.pending_amount / 100,
        })),
        snapshots_saved: snapshots.length,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[fetch-balance] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
