import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface StripeCustomer {
  id: string;
  email: string | null;
}

interface StripePaymentIntent {
  id: string;
  customer: string | StripeCustomer | null;
  amount: number;
  currency: string;
  status: string;
  last_payment_error?: {
    code?: string;
    message?: string;
  } | null;
  created: number;
  metadata: Record<string, string>;
  receipt_email?: string | null;
}

interface StripeListResponse {
  data: StripePaymentIntent[];
  has_more: boolean;
}

// Cache for customer emails to avoid repeated API calls
const customerEmailCache = new Map<string, string | null>();

async function getCustomerEmail(customerId: string, stripeSecretKey: string): Promise<string | null> {
  if (customerEmailCache.has(customerId)) {
    return customerEmailCache.get(customerId) || null;
  }

  try {
    const response = await fetch(
      `https://api.stripe.com/v1/customers/${customerId}`,
      {
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    if (!response.ok) {
      customerEmailCache.set(customerId, null);
      return null;
    }

    const customer: StripeCustomer = await response.json();
    customerEmailCache.set(customerId, customer.email);
    return customer.email || null;
  } catch (error) {
    console.error(`Error fetching customer ${customerId}:`, error);
    customerEmailCache.set(customerId, null);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return new Response(
        JSON.stringify({ error: "STRIPE_SECRET_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body for optional parameters
    let fetchAll = false;
    let startingAfter: string | null = null;
    
    try {
      const body = await req.json();
      fetchAll = body.fetchAll === true;
      startingAfter = body.startingAfter || null;
    } catch {
      // No body or invalid JSON, use defaults
    }

    console.log(`🔄 Stripe Sync - fetchAll: ${fetchAll}`);

    let allPaymentIntents: StripePaymentIntent[] = [];
    let hasMore = true;
    let cursor: string | null = startingAfter;
    let pageCount = 0;
    const maxPages = fetchAll ? 100 : 1; // Limit to 100 pages (10,000 transactions) for safety

    while (hasMore && pageCount < maxPages) {
      const url = new URL("https://api.stripe.com/v1/payment_intents");
      url.searchParams.set("limit", "100");
      url.searchParams.append("expand[]", "data.customer");
      if (cursor) {
        url.searchParams.set("starting_after", cursor);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Stripe API error:", errorText);
        return new Response(
          JSON.stringify({ error: "Stripe API error", details: errorText }),
          { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data: StripeListResponse = await response.json();
      allPaymentIntents = allPaymentIntents.concat(data.data);
      hasMore = data.has_more && fetchAll;
      
      if (data.data.length > 0) {
        cursor = data.data[data.data.length - 1].id;
      }
      
      pageCount++;
      console.log(`📄 Page ${pageCount}: ${data.data.length} payment intents (total: ${allPaymentIntents.length})`);
    }

    console.log(`✅ Fetched ${allPaymentIntents.length} total payment intents from Stripe`);

    // Process all transactions
    let paidCount = 0;
    let failedCount = 0;
    let skippedNoEmail = 0;

    const transactions: Array<{
      stripe_payment_intent_id: string;
      stripe_customer_id: string | null;
      customer_email: string;
      amount: number;
      currency: string;
      status: string;
      failure_code: string | null;
      failure_message: string | null;
      stripe_created_at: string;
      metadata: Record<string, string>;
      source: string;
    }> = [];

    const clientsMap = new Map<string, {
      email: string;
      payment_status: string;
      total_paid: number;
    }>();

    for (const pi of allPaymentIntents) {
      let email = pi.receipt_email || null;

      if (!email && pi.customer) {
        if (typeof pi.customer === 'object' && pi.customer !== null) {
          email = pi.customer.email || null;
        } else if (typeof pi.customer === 'string') {
          email = await getCustomerEmail(pi.customer, stripeSecretKey);
        }
      }

      if (!email) {
        skippedNoEmail++;
        continue;
      }

      let mappedStatus: string;
      if (pi.status === "succeeded") {
        mappedStatus = "paid";
        paidCount++;
      } else if (["requires_payment_method", "requires_action", "canceled", "requires_confirmation", "processing"].includes(pi.status)) {
        mappedStatus = "failed";
        failedCount++;
      } else {
        mappedStatus = "failed";
        failedCount++;
      }

      transactions.push({
        stripe_payment_intent_id: pi.id,
        stripe_customer_id: typeof pi.customer === 'string' ? pi.customer : (pi.customer as StripeCustomer)?.id || null,
        customer_email: email,
        amount: pi.amount,
        currency: pi.currency,
        status: mappedStatus,
        failure_code: pi.last_payment_error?.code || (mappedStatus === "failed" ? pi.status : null),
        failure_message: pi.last_payment_error?.message || (mappedStatus === "failed" ? `Status: ${pi.status}` : null),
        stripe_created_at: new Date(pi.created * 1000).toISOString(),
        metadata: pi.metadata || {},
        source: "stripe",
      });

      // Aggregate client data
      const existing = clientsMap.get(email) || { email, payment_status: 'none', total_paid: 0 };
      if (mappedStatus === 'paid') {
        existing.payment_status = 'paid';
        existing.total_paid += pi.amount / 100;
      } else if (mappedStatus === 'failed' && existing.payment_status !== 'paid') {
        existing.payment_status = 'failed';
      }
      clientsMap.set(email, existing);
    }

    console.log(`📊 Stats: ${paidCount} paid, ${failedCount} failed, ${skippedNoEmail} skipped (no email)`);

    // Batch upsert transactions in chunks of 500
    let syncedCount = 0;
    const BATCH_SIZE = 500;
    
    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      const batch = transactions.slice(i, i + BATCH_SIZE);
      const { data: upsertedData, error: upsertError } = await supabase
        .from("transactions")
        .upsert(batch, { onConflict: "stripe_payment_intent_id", ignoreDuplicates: false })
        .select();

      if (upsertError) {
        console.error(`Error upserting batch ${i / BATCH_SIZE + 1}:`, upsertError);
      } else {
        syncedCount += upsertedData?.length || 0;
      }
    }

    // Upsert clients
    const clientsToUpsert = Array.from(clientsMap.values()).map(c => ({
      email: c.email,
      payment_status: c.payment_status,
      total_paid: c.total_paid,
      last_sync: new Date().toISOString(),
      status: 'active'
    }));

    let clientsSynced = 0;
    for (let i = 0; i < clientsToUpsert.length; i += BATCH_SIZE) {
      const batch = clientsToUpsert.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from("clients")
        .upsert(batch, { onConflict: "email", ignoreDuplicates: false });

      if (!error) {
        clientsSynced += batch.length;
      }
    }

    console.log(`✅ Synced ${syncedCount} transactions, ${clientsSynced} clients`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${syncedCount} transactions from Stripe`,
        synced_transactions: syncedCount,
        synced_clients: clientsSynced,
        paid_count: paidCount,
        failed_count: failedCount,
        skipped_no_email: skippedNoEmail,
        total_fetched: allPaymentIntents.length,
        pages_fetched: pageCount,
        has_more: hasMore,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
