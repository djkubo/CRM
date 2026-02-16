import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invokeWithAdminKey } from "@/lib/adminApi";

// Client info from join
export interface InvoiceClient {
  id: string;
  full_name: string | null;
  email: string | null;
  phone_e164: string | null;
}

export interface Invoice {
  id: string;
  stripe_invoice_id: string;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  stripe_customer_id: string | null;
  client_id: string | null;
  client: InvoiceClient | null;
  amount_due: number;
  amount_paid: number | null;
  amount_remaining: number | null;
  subtotal: number | null;
  total: number | null;
  currency: string;
  status: string;
  stripe_created_at: string | null;
  finalized_at: string | null;
  automatically_finalizes_at: string | null;
  paid_at: string | null;
  period_end: string | null;
  next_payment_attempt: string | null;
  due_date: string | null;
  hosted_invoice_url: string | null;
  pdf_url: string | null;
  invoice_number: string | null;
  subscription_id: string | null;
  plan_name: string | null;
  plan_interval: string | null;
  product_name: string | null;
  attempt_count: number | null;
  billing_reason: string | null;
  collection_method: string | null;
  description: string | null;
  payment_intent_id: string | null;
  charge_id: string | null;
  default_payment_method: string | null;
  last_finalization_error: string | null;
  lines: Array<{
    id: string;
    amount: number;
    currency: string;
    description: string | null;
    quantity: number;
    price_id?: string;
    price_nickname?: string;
    unit_amount?: number;
    interval?: string;
    product_name?: string;
  }> | null;
  raw_data?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type InvoiceStatus = 'all' | 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';

interface SyncProgress {
  syncRunId: string;
  status: 'running' | 'continuing' | 'completed' | 'failed' | 'cancelled';
  totalFetched: number;
  totalInserted: number;
  currentChunk?: number;
  totalChunks?: number;
  currentPage?: number;
  errorMessage?: string | null;
}

interface UseInvoicesOptions {
  statusFilter?: InvoiceStatus;
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

/**
 * REFACTORED: Fire-and-Forget sync with polling
 * - Removes client-side loops
 * - Uses sync_runs table for progress monitoring
 * - Single Edge Function call triggers background processing
 */
export function useInvoices(options: UseInvoicesOptions = {}) {
  const {
    statusFilter = 'all',
    searchQuery = '',
    startDate,
    endDate,
    page = 1,
    pageSize = 50,
  } = options;

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeSyncRunId, setActiveSyncRunId] = useState<string | null>(null);

  // Calculate pagination range
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // SERVER-SIDE paginated query for invoices
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["invoices", statusFilter, searchQuery, startDate, endDate, page, pageSize],
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("*", { count: 'exact' })
        .order("stripe_created_at", { ascending: false, nullsFirst: false })
        .range(from, to);

      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'open') {
          query = query.in('status', ['open', 'pending']);
        } else if (statusFilter === 'uncollectible') {
          query = query.in('status', ['uncollectible', 'failed']);
        } else {
          query = query.eq('status', statusFilter);
        }
      }

      // Date range filter
      if (startDate) query = query.gte('stripe_created_at', startDate);
      if (endDate) query = query.lte('stripe_created_at', endDate);

      // Search filter
      if (searchQuery) {
        query = query.or(`customer_email.ilike.%${searchQuery}%,customer_name.ilike.%${searchQuery}%,invoice_number.ilike.%${searchQuery}%`);
      }

      const { data: invoices, error, count } = await query;

      if (error) throw error;

      return {
        invoices: (invoices || []).map(row => ({
          ...row,
          client: null,
          lines: row.lines as unknown as Invoice['lines'],
          raw_data: row.raw_data as unknown as Invoice['raw_data'],
        })) as Invoice[],
        totalCount: count || 0,
      };
    },
  });

  const invoices = useMemo(() => data?.invoices ?? [], [data?.invoices]);
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.ceil(totalCount / pageSize);

  // Poll sync_runs for progress when syncing
  useEffect(() => {
    if (!activeSyncRunId || !isSyncing) return;

    const pollInterval = setInterval(async () => {
      const { data: syncRun, error } = await supabase
        .from('sync_runs')
        .select('id, status, total_fetched, total_inserted, error_message, metadata, checkpoint')
        .eq('id', activeSyncRunId)
        .single();

      if (error || !syncRun) {
        clearInterval(pollInterval);
        setIsSyncing(false);
        setActiveSyncRunId(null);
        return;
      }

      const metadata = syncRun.metadata as Record<string, any> | null;
      const checkpoint = syncRun.checkpoint as Record<string, any> | null;

      setSyncProgress({
        syncRunId: syncRun.id,
        status: syncRun.status as SyncProgress['status'],
        totalFetched: syncRun.total_fetched || 0,
        totalInserted: syncRun.total_inserted || 0,
        currentChunk: metadata?.currentChunk || checkpoint?.chunkIndex,
        totalChunks: metadata?.totalChunks || checkpoint?.totalChunks,
        currentPage: metadata?.currentPage || checkpoint?.page,
        errorMessage: syncRun.error_message,
      });

      // Sync finished
      if (['completed', 'failed', 'cancelled'].includes(syncRun.status)) {
        clearInterval(pollInterval);
        setIsSyncing(false);
        setActiveSyncRunId(null);

        if (syncRun.status === 'completed') {
          toast({
            title: "Sincronización completa",
            description: `${syncRun.total_inserted?.toLocaleString() || 0} facturas sincronizadas`,
          });
          // Invalidate queries to refresh data
          queryClient.invalidateQueries({ queryKey: ["invoices"] });
          queryClient.invalidateQueries({ queryKey: ["unified-invoices"] });
          queryClient.invalidateQueries({ queryKey: ["unified-invoices-summary"] });
        } else if (syncRun.status === 'failed') {
          toast({
            title: "Error en sincronización",
            description: syncRun.error_message || "Error desconocido",
            variant: "destructive",
          });
        }
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(pollInterval);
  }, [activeSyncRunId, isSyncing, queryClient, toast]);

  /**
   * FIRE-AND-FORGET: Single call to backend
   * Backend handles all pagination via EdgeRuntime.waitUntil
   */
  const syncInvoicesFull = useCallback(async (mode: 'full' | 'recent' = 'recent') => {
    if (isSyncing) {
      toast({
        title: "Sincronización en progreso",
        description: "Espera a que termine la sincronización actual",
        variant: "destructive",
      });
      return { success: false, error: 'Already syncing' };
    }

    setIsSyncing(true);
    setSyncProgress(null);

    try {
      const result = await invokeWithAdminKey<{
        success: boolean;
        syncRunId?: string;
        error?: string;
        status?: string;
        backgroundProcessing?: boolean;
      }>("fetch-invoices", {
        mode,
        fetchAll: true, // Activates background worker
      });

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to start sync');
      }

      // Start polling if we got a syncRunId
      if (result.syncRunId) {
        setActiveSyncRunId(result.syncRunId);
        setSyncProgress({
          syncRunId: result.syncRunId,
          status: 'running',
          totalFetched: 0,
          totalInserted: 0,
        });

        toast({
          title: "Sincronización iniciada",
          description: "El proceso se ejecuta en segundo plano. Puedes continuar trabajando.",
        });

        return { success: true, syncRunId: result.syncRunId };
      }

      // Immediate completion (small sync)
      setIsSyncing(false);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["unified-invoices"] });

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      toast({
        title: "Error al iniciar sincronización",
        description: message,
        variant: "destructive",
      });
      setIsSyncing(false);
      return { success: false, error: message };
    }
  }, [isSyncing, queryClient, toast]);

  // Quick sync mutation wrapper
  const syncInvoices = useMutation({
    mutationFn: async () => {
      return await syncInvoicesFull('recent');
    },
  });

  // Calculate totals from current page (for display purposes)
  const totalPending = invoices
    .filter(inv => inv.status === 'open' || inv.status === 'draft')
    .reduce((sum, inv) => sum + inv.amount_due, 0) / 100;

  const totalPaid = invoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + (inv.amount_paid || 0), 0) / 100;

  // Get invoices due in next 72 hours
  const next72Hours = new Date();
  next72Hours.setHours(next72Hours.getHours() + 72);

  const invoicesNext72h = invoices.filter((inv) => {
    if (!['open', 'draft'].includes(inv.status)) return false;
    const targetDate = inv.status === 'open'
      ? inv.next_payment_attempt
      : (inv.automatically_finalizes_at || inv.next_payment_attempt);
    if (!targetDate) return false;
    return new Date(targetDate) <= next72Hours;
  });

  const totalNext72h = invoicesNext72h.reduce((sum, inv) => sum + inv.amount_due, 0) / 100;

  // Uncollectible totals
  const uncollectibleInvoices = invoices.filter(inv => inv.status === 'uncollectible');
  const totalUncollectible = uncollectibleInvoices.reduce((sum, inv) => sum + inv.amount_due, 0) / 100;

  // Status counts (from current page)
  const statusCounts = {
    all: totalCount,
    draft: invoices.filter(i => i.status === 'draft').length,
    open: invoices.filter(i => i.status === 'open').length,
    paid: invoices.filter(i => i.status === 'paid').length,
    void: invoices.filter(i => i.status === 'void').length,
    uncollectible: invoices.filter(i => i.status === 'uncollectible').length,
  };

  // Export to CSV
  const exportToCSV = useCallback(() => {
    if (invoices.length === 0) {
      toast({ title: "Sin datos para exportar", variant: "destructive" });
      return;
    }

    const headers = [
      'Invoice Number', 'Customer Name', 'Customer Email', 'Amount Due', 'Amount Paid',
      'Currency', 'Status', 'Plan', 'Frequency', 'Due Date', 'Created At', 'PDF URL'
    ];

    const rows = invoices.map(inv => [
      inv.invoice_number || inv.stripe_invoice_id,
      inv.customer_name || '',
      inv.customer_email || '',
      (inv.amount_due / 100).toFixed(2),
      ((inv.amount_paid || 0) / 100).toFixed(2),
      inv.currency?.toUpperCase() || 'USD',
      inv.status,
      inv.product_name || inv.plan_name || '',
      inv.plan_interval || '',
      inv.due_date || '',
      inv.stripe_created_at || '',
      inv.pdf_url || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `invoices_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();

    toast({ title: "CSV exportado", description: `${invoices.length} facturas exportadas` });
  }, [invoices, toast]);

  return {
    invoices,
    isLoading,
    isSyncing,
    refetch,
    syncInvoices,
    syncInvoicesFull,
    syncProgress,
    // Pagination
    page,
    pageSize,
    totalCount,
    totalPages,
    // Calculated totals (from current page)
    totalPending,
    totalPaid,
    totalNext72h,
    invoicesNext72h,
    totalUncollectible,
    uncollectibleCount: uncollectibleInvoices.length,
    statusCounts,
    exportToCSV,
  };
}
