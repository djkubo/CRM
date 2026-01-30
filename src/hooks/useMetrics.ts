import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DashboardMetrics {
  // Today's sales
  salesTodayUSD: number;
  salesTodayMXN: number;
  salesTodayTotal: number;
  // Month's sales (GROSS)
  salesMonthUSD: number;
  salesMonthMXN: number;
  salesMonthTotal: number;
  // NET Revenue (after refunds)
  refundsMonthUSD: number;
  refundsMonthMXN: number;
  refundsMonthTotal: number;
  netRevenueMonthUSD: number;
  netRevenueMonthMXN: number;
  netRevenueMonthTotal: number;
  conversionRate: number;
  trialCount: number;
  convertedCount: number;
  churnCount: number;
  recoveryList: Array<{
    email: string;
    full_name: string | null;
    phone: string | null;
    amount: number;
    source: string;
    recovery_status?: 'pending' | 'contacted' | 'paid' | 'lost';
  }>;
  // New lifecycle counts
  leadCount: number;
  customerCount: number;
}

const defaultMetrics: DashboardMetrics = {
  salesTodayUSD: 0,
  salesTodayMXN: 0,
  salesTodayTotal: 0,
  salesMonthUSD: 0,
  salesMonthMXN: 0,
  salesMonthTotal: 0,
  refundsMonthUSD: 0,
  refundsMonthMXN: 0,
  refundsMonthTotal: 0,
  netRevenueMonthUSD: 0,
  netRevenueMonthMXN: 0,
  netRevenueMonthTotal: 0,
  conversionRate: 0,
  trialCount: 0,
  convertedCount: 0,
  churnCount: 0,
  recoveryList: [],
  leadCount: 0,
  customerCount: 0
};

export function useMetrics() {
  const [metrics, setMetrics] = useState<DashboardMetrics>(defaultMetrics);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    setIsLoading(true);
    try {
      // Use timezone-aware date calculation matching server (America/Mexico_City)
      // Get current time and calculate dates using Mexico City timezone offset
      const now = new Date();
      
      // Calculate first day of month in Mexico City time
      const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      // Start of today in Mexico City time (UTC-6, accounting for DST)
      // The server RPCs use America/Mexico_City, so we need to match
      const mexicoOffsetHours = -6; // CST (adjust if DST is needed)
      const utcNow = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
      const mexicoNow = new Date(utcNow.getTime() + mexicoOffsetHours * 3600000);
      const startOfTodayMexico = new Date(mexicoNow.getFullYear(), mexicoNow.getMonth(), mexicoNow.getDate());
      // Convert back to UTC for database query
      const startOfTodayUTC = new Date(startOfTodayMexico.getTime() - mexicoOffsetHours * 3600000);
      
      // OPTIMIZATION: Use kpi_sales_summary RPC if available, fallback to limited query
      let salesMonthUSD = 0;
      let salesMonthMXN = 0;
      let salesTodayUSD = 0;
      let salesTodayMXN = 0;
      let refundsMonthUSD = 0;
      let refundsMonthMXN = 0;

      try {
        // Try RPC first (server-side aggregation - instant)
        // Note: RPC may not be in types yet, using type assertion
        const { data: salesSummary, error: rpcError } = await supabase.rpc('kpi_sales_summary' as any);
        
        // Normalize: accept both object and array formats for compatibility
        if (!rpcError && salesSummary) {
          const salesArray = Array.isArray(salesSummary) ? salesSummary : [salesSummary];
          if (salesArray.length > 0) {
            const summary = salesArray[0] as any;
            // RPC returns amounts in cents - accept both new (sales_usd) and legacy (total_usd) field names
            salesMonthUSD = (summary.sales_usd ?? summary.total_usd ?? 0) / 100;
            salesMonthMXN = (summary.sales_mxn ?? summary.total_mxn ?? 0) / 100;
            refundsMonthUSD = (summary.refunds_usd ?? 0) / 100;
            refundsMonthMXN = (summary.refunds_mxn ?? 0) / 100;
            salesTodayUSD = (summary.today_usd ?? 0) / 100;
            salesTodayMXN = (summary.today_mxn ?? 0) / 100;
          }
        } else if (rpcError) {
          // Fallback: Limited query (only if RPC doesn't exist yet)
          console.warn('kpi_sales_summary RPC not available, using limited fallback');
          const { data: monthlyTransactions } = await supabase
            .from('transactions')
            .select('amount, currency, status, stripe_created_at')
            .gte('stripe_created_at', firstDayOfMonth.toISOString())
            .in('status', ['succeeded', 'paid', 'refunded'])
            .order('stripe_created_at', { ascending: false })
            .limit(500); // Reduced limit to prevent timeout

          for (const tx of monthlyTransactions || []) {
            const amountInCurrency = tx.amount / 100;
            const txDate = tx.stripe_created_at ? new Date(tx.stripe_created_at) : null;
            const isToday = txDate && txDate >= startOfTodayUTC;
            const isRefund = tx.status === 'refunded';
            
            if (tx.currency?.toLowerCase() === 'mxn') {
              if (isRefund) {
                refundsMonthMXN += amountInCurrency;
              } else {
                salesMonthMXN += amountInCurrency;
                if (isToday) salesTodayMXN += amountInCurrency;
              }
            } else {
              if (isRefund) {
                refundsMonthUSD += amountInCurrency;
              } else {
                salesMonthUSD += amountInCurrency;
                if (isToday) salesTodayUSD += amountInCurrency;
              }
            }
          }
        }
      } catch (salesError) {
        console.error('Error fetching sales data:', salesError);
      }

      const MXN_TO_USD = 0.05;
      const salesMonthTotal = salesMonthUSD + (salesMonthMXN * MXN_TO_USD);
      const salesTodayTotal = salesTodayUSD + (salesTodayMXN * MXN_TO_USD);
      const refundsMonthTotal = refundsMonthUSD + (refundsMonthMXN * MXN_TO_USD);
      
      // NET Revenue = Gross - Refunds
      const netRevenueMonthUSD = salesMonthUSD - refundsMonthUSD;
      const netRevenueMonthMXN = salesMonthMXN - refundsMonthMXN;
      const netRevenueMonthTotal = salesMonthTotal - refundsMonthTotal;

      // Recovery list is now fetched from the optimized RPC (pre-computed)
      // Initialize empty - will be populated by dashboard_metrics RPC below
      let recoveryList: DashboardMetrics['recoveryList'] = [];

      // OPTIMIZATION: Use dashboard_metrics RPC instead of 5 parallel COUNT queries
      // This reduces 5 heavy queries (221k+ rows each) to 1 server-side aggregation
      let finalLeadCount = 0;
      let finalTrialCount = 0;
      let finalCustomerCount = 0;
      let finalChurnCount = 0;
      let finalConvertedCount = 0;
      
      try {
        const { data: dashboardData, error: dashboardError } = await supabase.rpc('dashboard_metrics' as any);
        
        // Normalize: accept both object and array formats for compatibility
        if (!dashboardError && dashboardData) {
          const metricsArray = Array.isArray(dashboardData) ? dashboardData : [dashboardData];
          if (metricsArray.length > 0) {
            // Optimized RPC now uses materialized view - instant response (~50ms)
            const dbMetrics = metricsArray[0] as any;
            finalLeadCount = dbMetrics.lead_count ?? 0;
            finalTrialCount = dbMetrics.trial_count ?? 0;
            finalCustomerCount = dbMetrics.customer_count ?? 0;
            finalChurnCount = dbMetrics.churn_count ?? 0;
            finalConvertedCount = dbMetrics.converted_count ?? 0;
            
            // Use recovery list from RPC (optimized - no client JOIN)
            if (dbMetrics.recovery_list && Array.isArray(dbMetrics.recovery_list)) {
              recoveryList = dbMetrics.recovery_list.map((r: any) => ({
                email: r.email,
                full_name: null, // Not fetched in ultra-fast mode
                phone: null,     // Not fetched in ultra-fast mode
                amount: r.amount,
                source: r.source,
                recovery_status: undefined
              }));
            }
          }
        } else if (dashboardError) {
          console.warn('dashboard_metrics RPC error:', dashboardError.message);
        }
      } catch (rpcError) {
        console.error('Error calling dashboard_metrics RPC:', rpcError);
      }
      
      const conversionRate = finalTrialCount > 0 ? (finalConvertedCount / finalTrialCount) * 100 : 0;

      setMetrics({
        salesTodayUSD,
        salesTodayMXN,
        salesTodayTotal,
        salesMonthUSD,
        salesMonthMXN,
        salesMonthTotal,
        refundsMonthUSD,
        refundsMonthMXN,
        refundsMonthTotal,
        netRevenueMonthUSD,
        netRevenueMonthMXN,
        netRevenueMonthTotal,
        conversionRate,
        trialCount: finalTrialCount,
        convertedCount: finalConvertedCount,
        churnCount: finalChurnCount,
        recoveryList,
        leadCount: finalLeadCount,
        customerCount: finalCustomerCount
      });
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);
  
  // OPTIMIZATION: Use polling instead of Realtime to avoid AbortError issues
  // Realtime was causing "signal is aborted without reason" errors
  useEffect(() => {
    const interval = setInterval(() => {
      fetchMetrics();
    }, 60000); // Refresh every 60 seconds
    
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  return { metrics, isLoading, refetch: fetchMetrics };
}
