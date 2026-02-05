import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invokeWithAdminKey } from "@/lib/adminApi";
import { useState, useCallback } from "react";

export interface Transaction {
  id: string;
  stripe_payment_intent_id: string;
  payment_key: string | null;
  payment_type: string | null;
  subscription_id: string | null;
  amount: number;
  currency: string | null;
  status: string;
  failure_code: string | null;
  failure_message: string | null;
  customer_email: string | null;
  stripe_customer_id: string | null;
  stripe_created_at: string | null;
  created_at: string | null;
  source: string | null;
  external_transaction_id: string | null;
  metadata: any | null;
}

export interface UseTransactionsOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  source?: string;
  startDate?: string;
  endDate?: string;
}

export function useTransactions(options: UseTransactionsOptions = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const {
    page = 0,
    pageSize = 100,
    search = "",
    status = "all",
    source = "all",
    startDate,
    endDate,
  } = options;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["transactions", page, pageSize, search, status, source, startDate, endDate],
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("transactions")
        .select("id, stripe_payment_intent_id, payment_key, payment_type, subscription_id, amount, currency, status, failure_code, failure_message, customer_email, stripe_customer_id, stripe_created_at, source, external_transaction_id, metadata", { count: "exact" })
        .order("stripe_created_at", { ascending: false });

      // Apply filters
      if (startDate) query = query.gte("stripe_created_at", startDate);
      if (endDate) query = query.lte("stripe_created_at", endDate);
      
      if (source !== "all") query = query.eq("source", source);
      
      if (status !== "all") {
        if (status === "success") query = query.in("status", ["succeeded", "paid"]);
        else if (status === "failed") query = query.in("status", ["failed", "requires_payment_method", "canceled"]);
        else if (status === "refunded") query = query.eq("status", "refunded");
        else if (status === "pending") query = query.in("status", ["pending", "requires_action"]);
        else query = query.eq("status", status);
      }

      if (search) {
        query = query.or(`customer_email.ilike.%${search}%,stripe_payment_intent_id.ilike.%${search}%,external_transaction_id.ilike.%${search}%`);
      }

      // Server-side pagination
      query = query.range(from, to);

      const { data, error, count } = await query;
      if (error) throw error;
      
      return {
        transactions: data as Transaction[],
        totalCount: count || 0,
      };
    },
    staleTime: 60000,
  });

  const syncStripe = useMutation({
    mutationFn: async () => {
      return await invokeWithAdminKey("fetch-stripe", {});
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      const syncedCount = data?.synced_transactions ?? data?.synced_count ?? data?.synced ?? 0;
      toast({
        title: "Sincronización completada",
        description: `Se sincronizaron ${syncedCount} transacciones desde Stripe.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error de sincronización",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    transactions: data?.transactions ?? [],
    totalCount: data?.totalCount ?? 0,
    isLoading,
    error,
    syncStripe,
    refetch,
  };
}
