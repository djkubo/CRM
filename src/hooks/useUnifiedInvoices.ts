import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SourceFilter = 'stripe' | 'unified';
export type UnifiedInvoiceStatus = 'all' | 'draft' | 'open' | 'paid' | 'void' | 'uncollectible' | 'pending' | 'failed';

export interface UnifiedInvoice {
  id: string;
  external_id: string;
  invoice_number: string | null;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  client_id: string | null;
  client: {
    id: string;
    full_name: string | null;
    email: string | null;
    phone_e164: string | null;
  } | null;
  amount_due: number; // in cents
  amount_paid: number | null; // in cents
  total: number | null; // in cents
  currency: string;
  status: string;
  source: 'stripe' | 'paypal';
  created_at: string | null;
  due_date: string | null;
  paid_at: string | null;
  product_name: string | null;
  plan_name: string | null;
  plan_interval: string | null;
  attempt_count: number | null;
  pdf_url: string | null;
  hosted_url: string | null;
  automatically_finalizes_at: string | null;
  finalized_at: string | null;
  subscription_id: string | null;
  last_finalization_error: string | null;
  // For PayPal - no charge action available
  can_charge: boolean;
}

interface UseUnifiedInvoicesOptions {
  sourceFilter?: SourceFilter;
  statusFilter?: UnifiedInvoiceStatus;
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
}

export function useUnifiedInvoices(options: UseUnifiedInvoicesOptions = {}) {
  const { 
    sourceFilter = 'unified', 
    statusFilter = 'all', 
    searchQuery = '', 
    startDate, 
    endDate 
  } = options;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["unified-invoices", sourceFilter, statusFilter, searchQuery, startDate, endDate],
    queryFn: async () => {
      const results: UnifiedInvoice[] = [];

      // ===== STRIPE INVOICES =====
      let stripeQuery = supabase
        .from("invoices")
        .select(`
          *,
          client:clients!client_id (
            id,
            full_name,
            email,
            phone_e164
          )
        `)
        .order("stripe_created_at", { ascending: false, nullsFirst: false })
        .limit(1000);

      if (statusFilter !== 'all' && !['pending', 'failed'].includes(statusFilter)) {
        stripeQuery = stripeQuery.eq('status', statusFilter);
      }
      if (startDate) stripeQuery = stripeQuery.gte('stripe_created_at', startDate);
      if (endDate) stripeQuery = stripeQuery.lte('stripe_created_at', endDate);
      if (searchQuery) {
        stripeQuery = stripeQuery.or(`customer_email.ilike.%${searchQuery}%,customer_name.ilike.%${searchQuery}%,invoice_number.ilike.%${searchQuery}%`);
      }

      const { data: stripeData } = await stripeQuery;

      for (const inv of stripeData || []) {
        results.push({
          id: inv.id,
          external_id: inv.stripe_invoice_id,
          invoice_number: inv.invoice_number,
          customer_email: inv.customer_email,
          customer_name: inv.customer_name,
          customer_phone: inv.customer_phone,
          client_id: inv.client_id,
          client: inv.client as UnifiedInvoice['client'],
          amount_due: inv.amount_due,
          amount_paid: inv.amount_paid,
          total: inv.total,
          currency: inv.currency || 'usd',
          status: inv.status,
          source: 'stripe',
          created_at: inv.stripe_created_at,
          due_date: inv.due_date,
          paid_at: inv.paid_at,
          product_name: inv.product_name,
          plan_name: inv.plan_name,
          plan_interval: inv.plan_interval,
          attempt_count: inv.attempt_count,
          pdf_url: inv.pdf_url,
          hosted_url: inv.hosted_invoice_url,
          automatically_finalizes_at: inv.automatically_finalizes_at,
          finalized_at: inv.finalized_at,
          subscription_id: inv.subscription_id,
          last_finalization_error: inv.last_finalization_error,
          can_charge: inv.status === 'open',
        });
      }

      // ===== PAYPAL TRANSACTIONS (only if unified mode) =====
      if (sourceFilter === 'unified') {
        // Map unified status to PayPal transaction statuses
        let paypalStatusFilter: string[] = [];
        if (statusFilter === 'all') {
          paypalStatusFilter = ['paid', 'pending', 'failed'];
        } else if (statusFilter === 'paid') {
          paypalStatusFilter = ['paid'];
        } else if (statusFilter === 'pending' || statusFilter === 'open') {
          paypalStatusFilter = ['pending'];
        } else if (statusFilter === 'failed' || statusFilter === 'uncollectible') {
          paypalStatusFilter = ['failed'];
        }

        if (paypalStatusFilter.length > 0) {
          let paypalQuery = supabase
            .from("transactions")
            .select("*")
            .eq('source', 'paypal')
            .in('status', paypalStatusFilter)
            .order("stripe_created_at", { ascending: false })
            .limit(1000);

          if (startDate) paypalQuery = paypalQuery.gte('stripe_created_at', startDate);
          if (endDate) paypalQuery = paypalQuery.lte('stripe_created_at', endDate);
          if (searchQuery) {
            paypalQuery = paypalQuery.ilike('customer_email', `%${searchQuery}%`);
          }

          const { data: paypalData } = await paypalQuery;

          for (const tx of paypalData || []) {
            const meta = tx.metadata as Record<string, unknown> | null;
            const rawData = tx.raw_data as Record<string, unknown> | null;
            
            results.push({
              id: tx.id,
              external_id: tx.stripe_payment_intent_id,
              invoice_number: tx.stripe_payment_intent_id, // PayPal transaction ID as invoice number
              customer_email: tx.customer_email,
              customer_name: (meta?.payer_name as string) || (meta?.customer_name as string) || null,
              customer_phone: null,
              client_id: null,
              client: null,
              amount_due: tx.amount,
              amount_paid: tx.status === 'paid' ? tx.amount : null,
              total: tx.amount,
              currency: tx.currency || 'usd',
              status: tx.status === 'paid' ? 'paid' : tx.status === 'pending' ? 'open' : 'uncollectible',
              source: 'paypal',
              created_at: tx.stripe_created_at,
              due_date: null,
              paid_at: tx.status === 'paid' ? tx.stripe_created_at : null,
              product_name: (meta?.product_name as string) || (rawData?.item_name as string) || null,
              plan_name: null,
              plan_interval: null,
              attempt_count: null,
              pdf_url: null,
              hosted_url: null,
              automatically_finalizes_at: null,
              finalized_at: tx.status === 'paid' ? tx.stripe_created_at : null,
              subscription_id: tx.subscription_id,
              last_finalization_error: tx.failure_message,
              can_charge: false, // PayPal transactions cannot be force-charged
            });
          }
        }
      }

      // Sort by date descending
      results.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      });

      return results;
    },
  });

  const invoices = data || [];

  // Calculate totals
  const totalPending = invoices
    .filter(inv => ['open', 'draft', 'pending'].includes(inv.status))
    .reduce((sum, inv) => sum + inv.amount_due, 0) / 100;

  const totalPaid = invoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + (inv.amount_paid || 0), 0) / 100;

  const totalUncollectible = invoices
    .filter(inv => inv.status === 'uncollectible')
    .reduce((sum, inv) => sum + inv.amount_due, 0) / 100;

  // Calculate by source
  const stripeInvoices = invoices.filter(inv => inv.source === 'stripe');
  const paypalInvoices = invoices.filter(inv => inv.source === 'paypal');

  const stripeTotals = {
    pending: stripeInvoices.filter(i => ['open', 'draft'].includes(i.status)).reduce((s, i) => s + i.amount_due, 0) / 100,
    paid: stripeInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount_paid || 0), 0) / 100,
  };

  const paypalTotals = {
    pending: paypalInvoices.filter(i => ['open', 'pending'].includes(i.status)).reduce((s, i) => s + i.amount_due, 0) / 100,
    paid: paypalInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount_paid || 0), 0) / 100,
  };

  // Status counts
  const statusCounts = {
    all: invoices.length,
    draft: invoices.filter(i => i.status === 'draft').length,
    open: invoices.filter(i => ['open', 'pending'].includes(i.status)).length,
    paid: invoices.filter(i => i.status === 'paid').length,
    void: invoices.filter(i => i.status === 'void').length,
    uncollectible: invoices.filter(i => ['uncollectible', 'failed'].includes(i.status)).length,
  };

  // Invoices in next 72 hours (only Stripe has this data)
  const next72Hours = new Date();
  next72Hours.setHours(next72Hours.getHours() + 72);

  const invoicesNext72h = stripeInvoices.filter((inv) => {
    if (!['open', 'draft'].includes(inv.status)) return false;
    const targetDate = inv.automatically_finalizes_at;
    if (!targetDate) return false;
    return new Date(targetDate) <= next72Hours;
  });

  const totalNext72h = invoicesNext72h.reduce((sum, inv) => sum + inv.amount_due, 0) / 100;

  return {
    invoices,
    isLoading,
    refetch,
    totalPending,
    totalPaid,
    totalUncollectible,
    uncollectibleCount: invoices.filter(i => ['uncollectible', 'failed'].includes(i.status)).length,
    statusCounts,
    totalNext72h,
    invoicesNext72h,
    // Source breakdown
    stripeTotals,
    paypalTotals,
    stripeCount: stripeInvoices.length,
    paypalCount: paypalInvoices.length,
  };
}
