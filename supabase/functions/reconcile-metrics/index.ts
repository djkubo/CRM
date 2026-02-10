import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS: Allow all origins for production flexibility
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// SECURITY: JWT + is_admin() verification (do not rely on client-side gating)
async function verifyAdmin(req: Request): Promise<{ valid: boolean; error?: string }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing Authorization header' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { valid: false, error: 'Invalid token' };
  }

  const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');
  if (adminError || !isAdmin) {
    return { valid: false, error: 'Not authorized as admin' };
  }

  return { valid: true };
}

interface ReconcileRequest {
  source: 'stripe' | 'paypal';
  start_date: string; // YYYY-MM-DD
  end_date: string;
}

function toUtcDayStartIso(date: string): string {
  // Treat the input as a calendar date and anchor it to UTC midnight.
  return `${date}T00:00:00.000Z`;
}

function toUtcDayEndIso(date: string): string {
  // Inclusive end-of-day (UTC).
  return `${date}T23:59:59.999Z`;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authCheck = await verifyAdmin(req);
    if (!authCheck.valid) {
      return new Response(
        JSON.stringify({ error: 'Forbidden', message: authCheck.error }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const body: ReconcileRequest = await req.json();
    const { source, start_date, end_date } = body;

    const startIso = toUtcDayStartIso(start_date);
    const endIso = toUtcDayEndIso(end_date);

    console.log(`[reconcile] Starting for ${source} from ${start_date} to ${end_date}`);

    let externalTotal = 0;
    const externalTransactions: string[] = [];

    if (source === 'stripe' && stripeKey) {
      // Fetch from Stripe API
      const startTimestamp = Math.floor(new Date(startIso).getTime() / 1000);
      const endTimestamp = Math.floor(new Date(endIso).getTime() / 1000);

      let hasMore = true;
      let startingAfter: string | undefined;

      while (hasMore) {
        const params = new URLSearchParams({
          'created[gte]': startTimestamp.toString(),
          'created[lte]': endTimestamp.toString(),
          'limit': '100',
          'status': 'succeeded'
        });

        if (startingAfter) {
          params.set('starting_after', startingAfter);
        }

        const response = await fetch(
          `https://api.stripe.com/v1/charges?${params}`,
          {
            headers: {
              'Authorization': `Bearer ${stripeKey}`,
            }
          }
        );

        if (!response.ok) {
          throw new Error(`Stripe API error: ${response.status}`);
        }

        const data = await response.json();
        
        for (const charge of data.data) {
          if (charge.status === 'succeeded' && !charge.refunded) {
            externalTotal += charge.amount;
            // Prefer payment_intent id so we can compare apples-to-apples with internal records.
            const matchId = typeof charge.payment_intent === 'string' && charge.payment_intent
              ? charge.payment_intent
              : charge.id;
            externalTransactions.push(matchId);
          }
        }

        hasMore = data.has_more;
        if (data.data.length > 0) {
          startingAfter = data.data[data.data.length - 1].id;
        }
      }
    } else if (source === 'paypal') {
      const paypalClientId = Deno.env.get('PAYPAL_CLIENT_ID');
      const paypalSecret = Deno.env.get('PAYPAL_SECRET');
      
      if (!paypalClientId || !paypalSecret) {
        throw new Error('PayPal credentials not configured');
      }
      
      console.log('[reconcile] Starting PayPal reconciliation');
      
      // Get OAuth token
      const tokenRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(`${paypalClientId}:${paypalSecret}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });

      if (!tokenRes.ok) {
        throw new Error(`PayPal auth error: ${tokenRes.status}`);
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;
      
      // PayPal API requires ISO 8601 format with timezone
      // Use UTC to avoid hard-coding a locale offset.
      const startDateISO = startIso;
      const endDateISO = endIso;
      
      let page = 1;
      let hasMorePages = true;
      
      while (hasMorePages) {
        const txRes = await fetch(
          `https://api-m.paypal.com/v1/reporting/transactions?` +
          `start_date=${encodeURIComponent(startDateISO)}&` +
          `end_date=${encodeURIComponent(endDateISO)}&` +
          `page_size=100&page=${page}&fields=all`,
          { 
            headers: { 
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            } 
          }
        );

        if (!txRes.ok) {
          const errText = await txRes.text();
          console.error('[reconcile] PayPal API error:', errText);
          throw new Error(`PayPal API error: ${txRes.status}`);
        }

        const txData = await txRes.json();
        
        for (const tx of txData.transaction_details || []) {
          const status = tx.transaction_info?.transaction_status;
          const eventCode = tx.transaction_info?.transaction_event_code;
          
          // S = Success, only count completed payments (T00xx = payments received)
          if (status === 'S' && eventCode?.startsWith('T00')) {
            const amountStr = tx.transaction_info?.transaction_amount?.value || '0';
            const amount = Math.round(parseFloat(amountStr) * 100); // Convert to cents
            
            if (amount > 0) {
              externalTotal += amount;
              externalTransactions.push(tx.transaction_info.transaction_id);
            }
          }
        }
        
        // Check for more pages
        const totalPages = txData.total_pages || 1;
        if (page >= totalPages) {
          hasMorePages = false;
        } else {
          page++;
        }
      }
      
      console.log(`[reconcile] PayPal fetched ${externalTransactions.length} transactions, total: ${externalTotal}`);
    }

    // Get internal totals
    const { data: internalData, error: internalError } = await supabase
      .from('transactions')
      .select('amount, stripe_payment_intent_id, payment_key')
      .eq('source', source)
      // The app stores Stripe successes as `paid` (and older data may still use `succeeded`).
      // PayPal also uses `paid`.
      .in('status', ['paid', 'succeeded'])
      .gte('stripe_created_at', startIso)
      .lte('stripe_created_at', endIso);

    if (internalError) {
      throw internalError;
    }

    const internalTotal = internalData?.reduce((sum, t) => sum + t.amount, 0) || 0;
    // ID matching differs by provider:
    // - Stripe: internal uses PaymentIntent id.
    // - PayPal: internal uses payment_key=transaction_id (stripe_payment_intent_id is prefixed).
    const internalIds = new Set(
      internalData?.map(t => (source === 'paypal' ? t.payment_key : t.stripe_payment_intent_id)) || []
    );
    const externalIds = new Set(externalTransactions);

    // Find discrepancies
    const missingInternal = externalTransactions.filter(id => !internalIds.has(id));
    const missingExternal = Array.from(internalIds).filter(id => !externalIds.has(id as string));

    const difference = externalTotal - internalTotal;
    const differencePct = externalTotal > 0 
      ? Math.abs(difference / externalTotal * 100) 
      : 0;

    // Determine status
    let status = 'ok';
    if (differencePct > 5 || Math.abs(difference) > 10000) {
      status = 'fail';
    } else if (differencePct > 1 || Math.abs(difference) > 1000) {
      status = 'warning';
    }

    // Save reconciliation run
    const { data: runData, error: runError } = await supabase
      .from('reconciliation_runs')
      .insert({
        source,
        period_start: start_date,
        period_end: end_date,
        external_total: externalTotal,
        internal_total: internalTotal,
        difference,
        difference_pct: Math.round(differencePct * 100) / 100,
        status,
        missing_external: missingExternal.slice(0, 100),
        missing_internal: missingInternal.slice(0, 100)
      })
      .select()
      .single();

    if (runError) {
      console.error('[reconcile] Failed to save run:', runError);
    }

    console.log(`[reconcile] Completed: external=${externalTotal}, internal=${internalTotal}, diff=${difference}, status=${status}`);

    return new Response(
      JSON.stringify({
        success: true,
        reconciliation_id: runData?.id,
        source,
        period: { start: start_date, end: end_date },
        external_total: externalTotal,
        internal_total: internalTotal,
        difference,
        difference_pct: Math.round(differencePct * 100) / 100,
        status,
        missing_internal_count: missingInternal.length,
        missing_external_count: missingExternal.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[reconcile] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
