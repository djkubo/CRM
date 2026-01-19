import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface RecoverySuccessItem {
  invoice_id: string;
  customer_email: string | null;
  amount_recovered: number;
  currency: string;
  payment_method_used: string;
}

export interface RecoveryFailedItem {
  invoice_id: string;
  customer_email: string | null;
  amount_due: number;
  currency: string;
  error: string;
  cards_tried: number;
}

export interface RecoverySkippedItem {
  invoice_id: string;
  customer_email: string | null;
  amount_due: number;
  currency: string;
  reason: string;
  subscription_status?: string;
}

export interface RecoverySummary {
  total_invoices: number;
  processed_invoices: number;
  total_recovered: number;
  total_failed_amount: number;
  total_skipped_amount: number;
  currency: string;
  is_partial: boolean;
  remaining_invoices: number;
  next_starting_after?: string;
}

export interface RecoveryResult {
  succeeded: RecoverySuccessItem[];
  failed: RecoveryFailedItem[];
  skipped: RecoverySkippedItem[];
  summary: RecoverySummary;
}

export interface AggregatedResult {
  succeeded: RecoverySuccessItem[];
  failed: RecoveryFailedItem[];
  skipped: RecoverySkippedItem[];
  summary: {
    total_invoices: number;
    total_recovered: number;
    total_failed_amount: number;
    total_skipped_amount: number;
    currency: string;
    batches_processed: number;
  };
}

export type HoursLookback = 24 | 168 | 360 | 720 | 1440;

export const RECOVERY_RANGES: { hours: HoursLookback; label: string }[] = [
  { hours: 24, label: "Últimas 24h" },
  { hours: 168, label: "7 Días" },
  { hours: 360, label: "15 Días" },
  { hours: 720, label: "30 Días" },
  { hours: 1440, label: "60 Días" },
];

export function useSmartRecovery() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<AggregatedResult | null>(null);
  const [selectedRange, setSelectedRange] = useState<HoursLookback | null>(null);
  const [progress, setProgress] = useState<{ batch: number; message: string } | null>(null);
  const abortRef = useRef(false);
  const { toast } = useToast();

  const runRecovery = useCallback(async (hours_lookback: HoursLookback) => {
    setIsRunning(true);
    setSelectedRange(hours_lookback);
    setResult(null);
    setProgress({ batch: 0, message: "Iniciando Smart Recovery..." });
    abortRef.current = false;

    const aggregated: AggregatedResult = {
      succeeded: [],
      failed: [],
      skipped: [],
      summary: {
        total_invoices: 0,
        total_recovered: 0,
        total_failed_amount: 0,
        total_skipped_amount: 0,
        currency: "usd",
        batches_processed: 0,
      },
    };

    let starting_after: string | undefined;
    let hasMore = true;
    let batchNum = 0;

    try {
      while (hasMore && !abortRef.current) {
        batchNum++;
        setProgress({ 
          batch: batchNum, 
          message: `Procesando lote ${batchNum}... (${aggregated.succeeded.length} recuperados)` 
        });

        const { data, error } = await supabase.functions.invoke("recover-revenue", {
          body: { hours_lookback, starting_after },
        });

        if (error) throw error;

        const batchResult = data as RecoveryResult;

        // Aggregate results
        aggregated.succeeded.push(...batchResult.succeeded);
        aggregated.failed.push(...batchResult.failed);
        aggregated.skipped.push(...batchResult.skipped);
        aggregated.summary.total_invoices += batchResult.summary.processed_invoices;
        aggregated.summary.total_recovered += batchResult.summary.total_recovered;
        aggregated.summary.total_failed_amount += batchResult.summary.total_failed_amount;
        aggregated.summary.total_skipped_amount += batchResult.summary.total_skipped_amount;
        aggregated.summary.batches_processed = batchNum;

        // Update result in real-time
        setResult({ ...aggregated });

        // Check if there's more to process
        if (batchResult.summary.is_partial && batchResult.summary.next_starting_after) {
          starting_after = batchResult.summary.next_starting_after;
          hasMore = true;
          // Small delay between batches
          await new Promise(r => setTimeout(r, 1000));
        } else {
          hasMore = false;
        }
      }

      const { summary } = aggregated;
      
      if (abortRef.current) {
        toast({
          title: "Smart Recovery Cancelado",
          description: `Parcial: Recuperados $${(summary.total_recovered / 100).toFixed(2)} en ${batchNum} lotes`,
        });
      } else {
        toast({
          title: "Smart Recovery Completado",
          description: `Recuperados: $${(summary.total_recovered / 100).toFixed(2)} | Fallidos: $${(summary.total_failed_amount / 100).toFixed(2)} | Lotes: ${batchNum}`,
        });
      }

      return aggregated;
    } catch (error) {
      console.error("Smart Recovery error:", error);
      const errMsg = error instanceof Error ? error.message : "Error desconocido";
      
      // If we have partial results, show them
      if (aggregated.summary.batches_processed > 0) {
        toast({
          title: "Error en Smart Recovery (Resultados Parciales)",
          description: `Recuperados: $${(aggregated.summary.total_recovered / 100).toFixed(2)} antes del error. ${errMsg}`,
          variant: "destructive",
        });
        return aggregated;
      }
      
      toast({
        title: "Error en Smart Recovery",
        description: errMsg,
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  }, [toast]);

  const cancelRecovery = useCallback(() => {
    abortRef.current = true;
  }, []);

  const exportToCSV = useCallback(() => {
    if (!result) return;

    const rows: string[] = [];
    
    // Header
    rows.push("Tipo,Invoice ID,Email,Monto,Moneda,Detalle");

    // Succeeded
    result.succeeded.forEach((item) => {
      rows.push(`Recuperado,${item.invoice_id},${item.customer_email || "N/A"},${(item.amount_recovered / 100).toFixed(2)},${item.currency.toUpperCase()},${item.payment_method_used}`);
    });

    // Failed
    result.failed.forEach((item) => {
      rows.push(`Fallido,${item.invoice_id},${item.customer_email || "N/A"},${(item.amount_due / 100).toFixed(2)},${item.currency.toUpperCase()},"${item.error} (${item.cards_tried} tarjetas probadas)"`);
    });

    // Skipped
    result.skipped.forEach((item) => {
      rows.push(`Omitido,${item.invoice_id},${item.customer_email || "N/A"},${(item.amount_due / 100).toFixed(2)},${item.currency.toUpperCase()},${item.reason}`);
    });

    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `smart-recovery-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "Reporte exportado",
      description: "El archivo CSV se ha descargado correctamente",
    });
  }, [result, toast]);

  const clearResult = useCallback(() => {
    setResult(null);
    setSelectedRange(null);
  }, []);

  return {
    isRunning,
    result,
    selectedRange,
    progress,
    runRecovery,
    cancelRecovery,
    exportToCSV,
    clearResult,
  };
}
