import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMxnToUsdRate } from "@/hooks/useMxnToUsdRate";
import {
  DEFAULT_MXN_TO_USD_RATE,
  normalizeCurrency,
  toUsdEquivalentFromCents,
} from "@/lib/currency";

export type SourceFilter = 'stripe' | 'unified' | 'paypal';
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
  can_charge: boolean;
}

interface UseUnifiedInvoicesOptions {
  sourceFilter?: SourceFilter;
  statusFilter?: UnifiedInvoiceStatus;
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

interface CurrencyTotalsCents {
  usd: number;
  mxn: number;
  other: number;
}

const emptyCurrencyTotals = (): CurrencyTotalsCents => ({ usd: 0, mxn: 0, other: 0 });

function addToCurrencyTotals(
  totals: CurrencyTotalsCents,
  amountCents: number,
  currency: string | null | undefined
) {
  const amount = Number(amountCents) || 0;
  const curr = normalizeCurrency(currency);

  if (curr === "usd") {
    totals.usd += amount;
    return;
  }

  if (curr === "mxn") {
    totals.mxn += amount;
    return;
  }

  totals.other += amount;
}

/**
 * REFACTORED: Single Source of Truth
 * Now queries ONLY the `invoices` table (Stripe + PayPal are both stored there).
 * Implements real server-side pagination using .range()
 */
export function useUnifiedInvoices(options: UseUnifiedInvoicesOptions = {}) {
  const { 
    sourceFilter = 'unified', 
    statusFilter = 'all', 
    searchQuery = '', 
    startDate, 
    endDate,
    page = 1,
    pageSize = 50,
  } = options;
  const { data: mxnToUsdRate = DEFAULT_MXN_TO_USD_RATE } = useMxnToUsdRate();

  // Calculate range for pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // Fetch paginated invoices
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["unified-invoices", sourceFilter, statusFilter, searchQuery, startDate, endDate, page, pageSize],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select(`
          *,
          client:clients!client_id (
            id,
            full_name,
            email,
            phone_e164
          )
        `, { count: 'exact' })
        .order("stripe_created_at", { ascending: false, nullsFirst: false })
        .range(from, to);

      // Source filter: stripe_invoice_id starts with 'in_' for Stripe, 'paypal_' for PayPal
      if (sourceFilter === 'stripe') {
        query = query.like('stripe_invoice_id', 'in_%');
      } else if (sourceFilter === 'paypal') {
        query = query.like('stripe_invoice_id', 'paypal_%');
      }
      // 'unified' = all sources, no filter

      // Status filter - map UI statuses to DB values
      if (statusFilter !== 'all') {
        if (statusFilter === 'open') {
          // 'open' in UI means both 'open' and 'pending' in DB
          query = query.in('status', ['open', 'pending']);
        } else if (statusFilter === 'uncollectible') {
          // Include failed as uncollectible
          query = query.in('status', ['uncollectible', 'failed']);
        } else {
          query = query.eq('status', statusFilter);
        }
      }

      // Date filters
      if (startDate) query = query.gte('stripe_created_at', startDate);
      if (endDate) query = query.lte('stripe_created_at', endDate);

      // Search filter
      if (searchQuery) {
        query = query.or(`customer_email.ilike.%${searchQuery}%,customer_name.ilike.%${searchQuery}%,invoice_number.ilike.%${searchQuery}%`);
      }

      const { data: invoices, error, count } = await query;

      if (error) throw error;

      // Transform to UnifiedInvoice format
      const results: UnifiedInvoice[] = (invoices || []).map(inv => {
        const isPayPal = inv.stripe_invoice_id?.startsWith('paypal_');
        return {
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
          source: isPayPal ? 'paypal' : 'stripe',
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
          can_charge: !isPayPal && inv.status === 'open',
        };
      });

      return { invoices: results, totalCount: count || 0 };
    },
  });

  const invoices = data?.invoices || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Fetch summary stats (status counts + totals) - separate query for accurate counts
  const { data: summaryData } = useQuery({
    queryKey: ["unified-invoices-summary", sourceFilter, startDate, endDate],
    queryFn: async () => {
      // Build base query for summary (no pagination, just counts)
      let baseFilter = supabase.from("invoices").select("status, amount_due, amount_paid, stripe_invoice_id, automatically_finalizes_at, currency", { count: 'exact' });
      
      if (sourceFilter === 'stripe') {
        baseFilter = baseFilter.like('stripe_invoice_id', 'in_%');
      } else if (sourceFilter === 'paypal') {
        baseFilter = baseFilter.like('stripe_invoice_id', 'paypal_%');
      }
      
      if (startDate) baseFilter = baseFilter.gte('stripe_created_at', startDate);
      if (endDate) baseFilter = baseFilter.lte('stripe_created_at', endDate);

      const { data: allInvoices, count } = await baseFilter.limit(10000);
      
      if (!allInvoices) return null;

      const statusCounts = {
        all: count || allInvoices.length,
        draft: 0,
        open: 0,
        paid: 0,
        void: 0,
        uncollectible: 0,
      };

      const pendingTotals = emptyCurrencyTotals();
      const paidTotals = emptyCurrencyTotals();
      const uncollectibleTotals = emptyCurrencyTotals();
      let stripeCount = 0;
      let paypalCount = 0;
      const stripePaidTotals = emptyCurrencyTotals();
      const paypalPaidTotals = emptyCurrencyTotals();
      const stripePendingTotals = emptyCurrencyTotals();
      const paypalPendingTotals = emptyCurrencyTotals();

      const next72Hours = new Date();
      next72Hours.setHours(next72Hours.getHours() + 72);
      const next72hTotals = emptyCurrencyTotals();
      let invoicesNext72hCount = 0;

      for (const inv of allInvoices) {
        const isPayPal = inv.stripe_invoice_id?.startsWith('paypal_');
        if (isPayPal) paypalCount++;
        else stripeCount++;

        // Status counts
        if (inv.status === 'draft') statusCounts.draft++;
        else if (inv.status === 'open' || inv.status === 'pending') statusCounts.open++;
        else if (inv.status === 'paid') statusCounts.paid++;
        else if (inv.status === 'void') statusCounts.void++;
        else if (inv.status === 'uncollectible' || inv.status === 'failed') statusCounts.uncollectible++;

        // Totals
        if (inv.status === 'open' || inv.status === 'draft' || inv.status === 'pending') {
          addToCurrencyTotals(pendingTotals, inv.amount_due || 0, inv.currency);
          if (isPayPal) addToCurrencyTotals(paypalPendingTotals, inv.amount_due || 0, inv.currency);
          else addToCurrencyTotals(stripePendingTotals, inv.amount_due || 0, inv.currency);
        } else if (inv.status === 'paid') {
          addToCurrencyTotals(paidTotals, inv.amount_paid || 0, inv.currency);
          if (isPayPal) addToCurrencyTotals(paypalPaidTotals, inv.amount_paid || 0, inv.currency);
          else addToCurrencyTotals(stripePaidTotals, inv.amount_paid || 0, inv.currency);
        } else if (inv.status === 'uncollectible' || inv.status === 'failed') {
          addToCurrencyTotals(uncollectibleTotals, inv.amount_due || 0, inv.currency);
        }

        // Next 72 hours (Stripe drafts)
        if (!isPayPal && ['open', 'draft'].includes(inv.status) && inv.automatically_finalizes_at) {
          if (new Date(inv.automatically_finalizes_at) <= next72Hours) {
            addToCurrencyTotals(next72hTotals, inv.amount_due || 0, inv.currency);
            invoicesNext72hCount++;
          }
        }
      }

      return {
        statusCounts,
        pendingTotals,
        paidTotals,
        uncollectibleTotals,
        uncollectibleCount: statusCounts.uncollectible,
        next72hTotals,
        invoicesNext72hCount,
        stripeCount,
        paypalCount,
        stripeTotals: { pending: stripePendingTotals, paid: stripePaidTotals },
        paypalTotals: { pending: paypalPendingTotals, paid: paypalPaidTotals },
      };
    },
    staleTime: 30000, // Cache for 30 seconds
  });

  const convertCurrencyTotals = useMemo(() => {
    const toMajor = (totals: CurrencyTotalsCents) => ({
      usd: totals.usd / 100,
      mxn: totals.mxn / 100,
      other: totals.other / 100,
      usdEquivalent:
        toUsdEquivalentFromCents(totals.usd, "usd", mxnToUsdRate) +
        toUsdEquivalentFromCents(totals.mxn, "mxn", mxnToUsdRate) +
        toUsdEquivalentFromCents(totals.other, "usd", mxnToUsdRate),
    });

    const pending = toMajor(summaryData?.pendingTotals || emptyCurrencyTotals());
    const paid = toMajor(summaryData?.paidTotals || emptyCurrencyTotals());
    const uncollectible = toMajor(summaryData?.uncollectibleTotals || emptyCurrencyTotals());
    const next72h = toMajor(summaryData?.next72hTotals || emptyCurrencyTotals());
    const stripePending = toMajor(summaryData?.stripeTotals?.pending || emptyCurrencyTotals());
    const stripePaid = toMajor(summaryData?.stripeTotals?.paid || emptyCurrencyTotals());
    const paypalPending = toMajor(summaryData?.paypalTotals?.pending || emptyCurrencyTotals());
    const paypalPaid = toMajor(summaryData?.paypalTotals?.paid || emptyCurrencyTotals());

    return {
      pending,
      paid,
      uncollectible,
      next72h,
      stripeTotals: { pending: stripePending, paid: stripePaid },
      paypalTotals: { pending: paypalPending, paid: paypalPaid },
    };
  }, [summaryData, mxnToUsdRate]);

  return {
    invoices,
    isLoading,
    refetch,
    // Pagination
    page,
    pageSize,
    totalCount,
    totalPages,
    // Summary stats (from cached summary query)
    totalPending: convertCurrencyTotals.pending.usdEquivalent,
    totalPaid: convertCurrencyTotals.paid.usdEquivalent,
    totalUncollectible: convertCurrencyTotals.uncollectible.usdEquivalent,
    uncollectibleCount: summaryData?.uncollectibleCount || 0,
    statusCounts: summaryData?.statusCounts || { all: 0, draft: 0, open: 0, paid: 0, void: 0, uncollectible: 0 },
    totalNext72h: convertCurrencyTotals.next72h.usdEquivalent,
    invoicesNext72h: [], // Deprecated - use invoicesNext72hCount
    invoicesNext72hCount: summaryData?.invoicesNext72hCount || 0,
    pendingTotals: convertCurrencyTotals.pending,
    paidTotals: convertCurrencyTotals.paid,
    uncollectibleTotals: convertCurrencyTotals.uncollectible,
    next72hTotals: convertCurrencyTotals.next72h,
    // Source breakdown
    stripeTotals: convertCurrencyTotals.stripeTotals,
    paypalTotals: convertCurrencyTotals.paypalTotals,
    stripeCount: summaryData?.stripeCount || 0,
    paypalCount: summaryData?.paypalCount || 0,
  };
}
