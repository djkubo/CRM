import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { DollarSign, Loader2, Target, TrendingUp, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAnalyticsTransactions } from "@/hooks/useAnalyticsTransactions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

interface SourceMetrics {
  source: string;
  registrations: number;
  trials: number;
  customers: number;
  revenue: number; // primary currency (major units)
  ltv: number; // major units (avg total spend)
  conversionRate: number; // registrations -> paid
  trialToPaid: number; // trials -> paid
}

const COLORS = [
  "#AA0601",
  "#71717a",
  "#52525b",
  "#3f3f46",
  "#27272a",
  "#18181b",
  "#a1a1aa",
  "#d4d4d8",
];

export type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";

interface SourceAnalyticsProps {
  period?: AnalyticsPeriod;
}

function getDaysForPeriod(period: AnalyticsPeriod): number {
  switch (period) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
    case "all":
      // "Todo" in the UI means a long lookback, but still within reason for UI + charts.
      // Align with Analytics period label "12m".
      return 365;
  }
}

export function SourceAnalytics({ period = "30d" }: SourceAnalyticsProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [payingClients, setPayingClients] = useState<Array<{ email: string; acquisition_source: string | null; total_spend: number | null }>>([]);
  const [payingClientsLoading, setPayingClientsLoading] = useState(false);
  const [payingClientsError, setPayingClientsError] = useState<string | null>(null);

  const periodDays = getDaysForPeriod(period);
  const periodLabel = period === "all" ? "12m" : period;
  const periodStartIso = useMemo(() => {
    return new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString();
  }, [periodDays]);

  // Period transactions (successful only) - paged, auto-draining.
  const txQuery = useAnalyticsTransactions({
    startDate: periodStartIso,
    statuses: ["succeeded", "paid"],
    pageSize: 1000,
    maxPages: period === "all" ? 200 : 50,
  });

  const payingEmails = useMemo(() => {
    const s = new Set<string>();
    for (const tx of txQuery.transactions) {
      const email = typeof tx.customer_email === "string" ? tx.customer_email.trim().toLowerCase() : "";
      if (email) s.add(email);
    }
    return Array.from(s.values());
  }, [txQuery.transactions]);

  // Fetch the client records for paying emails so we can map revenue -> acquisition_source and compute LTV.
  useEffect(() => {
    const isTxComplete =
      !txQuery.isLoading &&
      !txQuery.isFetchingNextPage &&
      (txQuery.hasNextPage === false || txQuery.reachedMaxPages === true);

    if (!isTxComplete) return;

    let cancelled = false;
    const run = async () => {
      setPayingClientsError(null);
      setPayingClientsLoading(true);

      try {
        if (payingEmails.length === 0) {
          if (!cancelled) setPayingClients([]);
          return;
        }

        const out: Array<{ email: string; acquisition_source: string | null; total_spend: number | null }> = [];
        const CHUNK = 200;

        for (let i = 0; i < payingEmails.length; i += CHUNK) {
          const chunk = payingEmails.slice(i, i + CHUNK);
          const { data, error } = await supabase
            .from("clients")
            .select("email, acquisition_source, total_spend")
            .in("email", chunk);

          if (error) throw error;

          for (const row of data || []) {
            if (!row.email) continue;
            out.push({
              email: String(row.email).toLowerCase(),
              acquisition_source: row.acquisition_source ?? null,
              total_spend: (row as any).total_spend ?? null,
            });
          }
        }

        if (!cancelled) setPayingClients(out);
      } catch (e) {
        console.error("[SourceAnalytics] paying clients fetch error:", e);
        if (!cancelled) setPayingClientsError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setPayingClientsLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
    // Intentionally depend on the completion state + count only (avoid re-fetching mapping on every page).
  }, [periodStartIso, txQuery.isLoading, txQuery.isFetchingNextPage, txQuery.hasNextPage, txQuery.reachedMaxPages, payingEmails.length]);

  // Registrations in period (clients created within range)
  const registrationsQuery = useInfiniteQuery({
    queryKey: ["source-analytics", "registrations", periodStartIso],
    queryFn: async ({ pageParam }) => {
      const pageIndex = typeof pageParam === "number" ? pageParam : 0;
      const pageSize = 1000;
      const from = pageIndex * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from("clients")
        // Avoid `count=exact` on large production datasets (can trigger timeouts and 500s).
        .select("acquisition_source, created_at")
        .gte("created_at", periodStartIso)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      return { rows: data || [], totalCount: null, pageIndex };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.rows.length, 0);
      if (typeof lastPage.totalCount === "number") {
        if (loaded >= lastPage.totalCount) return undefined;
        return lastPage.pageIndex + 1;
      }
      if (lastPage.rows.length < 1000) return undefined;
      return lastPage.pageIndex + 1;
    },
    staleTime: 60_000,
    retry: false,
  });

  // Trials started in period
  const trialsQuery = useInfiniteQuery({
    queryKey: ["source-analytics", "trials", periodStartIso],
    queryFn: async ({ pageParam }) => {
      const pageIndex = typeof pageParam === "number" ? pageParam : 0;
      const pageSize = 1000;
      const from = pageIndex * pageSize;
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from("clients")
        // Avoid `count=exact` on large production datasets (can trigger timeouts and 500s).
        .select("acquisition_source, trial_started_at")
        .gte("trial_started_at", periodStartIso)
        .order("trial_started_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      return { rows: data || [], totalCount: null, pageIndex };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((sum, p) => sum + p.rows.length, 0);
      if (typeof lastPage.totalCount === "number") {
        if (loaded >= lastPage.totalCount) return undefined;
        return lastPage.pageIndex + 1;
      }
      if (lastPage.rows.length < 1000) return undefined;
      return lastPage.pageIndex + 1;
    },
    staleTime: 60_000,
    retry: false,
  });

  // Auto-drain pages (best-effort).
  useEffect(() => {
    if (registrationsQuery.status === "error") return;
    if (registrationsQuery.hasNextPage && !registrationsQuery.isFetchingNextPage) {
      registrationsQuery.fetchNextPage();
    }
  }, [registrationsQuery.status, registrationsQuery.hasNextPage, registrationsQuery.isFetchingNextPage, registrationsQuery.fetchNextPage]);

  useEffect(() => {
    if (trialsQuery.status === "error") return;
    if (trialsQuery.hasNextPage && !trialsQuery.isFetchingNextPage) {
      trialsQuery.fetchNextPage();
    }
  }, [trialsQuery.status, trialsQuery.hasNextPage, trialsQuery.isFetchingNextPage, trialsQuery.fetchNextPage]);

  const primaryCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const tx of txQuery.transactions) {
      const c = typeof tx.currency === "string" && tx.currency ? tx.currency.toLowerCase() : "usd";
      totals.set(c, (totals.get(c) || 0) + (tx.amount || 0));
    }
    let best = "usd";
    let bestAmt = -1;
    for (const [c, amt] of totals.entries()) {
      if (amt > bestAmt) {
        best = c;
        bestAmt = amt;
      }
    }
    return best;
  }, [txQuery.transactions]);

  const formatMoney = (valueMajor: number) => {
    const currency = primaryCurrency.toUpperCase();
    const amount = Number.isFinite(valueMajor) ? valueMajor : 0;
    try {
      return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${currency} ${amount.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
    }
  };

  const metrics = useMemo<SourceMetrics[]>(() => {
    const registrations = registrationsQuery.data?.pages.flatMap((p) => p.rows) ?? [];
    const trials = trialsQuery.data?.pages.flatMap((p) => p.rows) ?? [];

    const sourceMap = new Map<
      string,
      {
        registrations: number;
        trials: number;
        customerEmails: Set<string>;
        revenueByCurrency: Map<string, number>; // cents by currency
        totalSpendCents: number;
        spendCount: number;
      }
    >();

    const normSource = (s: unknown) => {
      const v = typeof s === "string" ? s.trim() : "";
      return v ? v : "unknown";
    };

    const ensure = (source: string) => {
      const key = normSource(source);
      if (!sourceMap.has(key)) {
        sourceMap.set(key, {
          registrations: 0,
          trials: 0,
          customerEmails: new Set(),
          revenueByCurrency: new Map(),
          totalSpendCents: 0,
          spendCount: 0,
        });
      }
      return sourceMap.get(key)!;
    };

    for (const row of registrations) {
      const src = normSource((row as any).acquisition_source);
      ensure(src).registrations += 1;
    }

    for (const row of trials) {
      const src = normSource((row as any).acquisition_source);
      ensure(src).trials += 1;
    }

    // Build email -> source + total_spend map from payingClients.
    const emailMeta = new Map<string, { source: string; totalSpendCents: number }>();
    for (const c of payingClients) {
      const email = c.email?.trim().toLowerCase();
      if (!email) continue;
      emailMeta.set(email, {
        source: normSource(c.acquisition_source),
        totalSpendCents: Number(c.total_spend) || 0,
      });
    }

    // Revenue + customers from transactions.
    for (const tx of txQuery.transactions) {
      const email = typeof tx.customer_email === "string" ? tx.customer_email.trim().toLowerCase() : "";
      if (!email) continue;

      const meta = emailMeta.get(email);
      const src = meta?.source ?? "unknown";
      const bucket = ensure(src);

      bucket.customerEmails.add(email);

      const c = typeof tx.currency === "string" && tx.currency ? tx.currency.toLowerCase() : "usd";
      bucket.revenueByCurrency.set(c, (bucket.revenueByCurrency.get(c) || 0) + (tx.amount || 0));
    }

    // LTV: average total_spend across paying customers per source (from clients table).
    for (const meta of emailMeta.values()) {
      const bucket = ensure(meta.source);
      bucket.totalSpendCents += meta.totalSpendCents;
      bucket.spendCount += 1;
    }

    const rows: SourceMetrics[] = Array.from(sourceMap.entries())
      .map(([source, d]) => {
        const customers = d.customerEmails.size;
        const revenueCents = d.revenueByCurrency.get(primaryCurrency) || 0;
        const revenueMajor = revenueCents / 100;
        const ltvMajor = d.spendCount > 0 ? d.totalSpendCents / d.spendCount / 100 : 0;

        const conversionRate = d.registrations > 0 ? Math.round((customers / d.registrations) * 100) : 0;
        const trialToPaid = d.trials > 0 ? Math.round((customers / d.trials) * 100) : 0;

        return {
          source,
          registrations: d.registrations,
          trials: d.trials,
          customers,
          revenue: revenueMajor,
          ltv: ltvMajor,
          conversionRate,
          trialToPaid,
        };
      })
      .filter((m) => m.registrations + m.trials + m.customers > 0 || m.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);

    return rows;
  }, [registrationsQuery.data, trialsQuery.data, payingClients, txQuery.transactions, primaryCurrency]);

  const totals = useMemo(() => {
    return metrics.reduce((acc, m) => ({
      registrations: acc.registrations + m.registrations,
      trials: acc.trials + m.trials,
      customers: acc.customers + m.customers,
      revenue: acc.revenue + m.revenue,
    }), { registrations: 0, trials: 0, customers: 0, revenue: 0 });
  }, [metrics]);

  const pieData = useMemo(() => {
    return metrics.slice(0, 6).map(m => ({
      name: m.source,
      value: m.revenue,
    }));
  }, [metrics]);

  const isLoading =
    txQuery.isLoading ||
    registrationsQuery.isLoading ||
    trialsQuery.isLoading ||
    payingClientsLoading;

  if (isLoading) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {(payingClientsError || registrationsQuery.error || trialsQuery.error || txQuery.error) && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          No se pudieron cargar algunas métricas por fuente. Revisa permisos (RLS) y vuelve a intentar.
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-4">
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-muted/40 border border-border/50 shrink-0">
                <Users className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-sm text-muted-foreground">Registros ({periodLabel})</p>
                <p className="text-lg sm:text-2xl font-bold text-foreground">{totals.registrations.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-muted/40 border border-border/50 shrink-0">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-sm text-muted-foreground">En prueba</p>
                <p className="text-lg sm:text-2xl font-bold text-foreground">{totals.trials.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-emerald-500/10 shrink-0">
                <Target className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-sm text-muted-foreground">Clientes</p>
                <p className="text-lg sm:text-2xl font-bold text-foreground">{totals.customers.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 shrink-0">
                <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] sm:text-sm text-muted-foreground">Ingresos ({periodLabel})</p>
                <p className="text-lg sm:text-2xl font-bold text-foreground">{formatMoney(totals.revenue)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Analytics */}
      <Card className="bg-card border-border">
        <CardHeader className="p-3 sm:p-6 pb-2 sm:pb-4">
          <CardTitle className="text-foreground flex items-center gap-2 text-sm sm:text-base">
            <Target className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            Atribución por Fuente
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm">
            Registros, pruebas, clientes e ingresos por canal
          </CardDescription>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 pt-0 sm:pt-0">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
              <TabsList className="mb-3 sm:mb-4 w-max sm:w-auto">
                <TabsTrigger value="overview" className="text-xs sm:text-sm px-2 sm:px-3">Resumen</TabsTrigger>
                <TabsTrigger value="revenue" className="text-xs sm:text-sm px-2 sm:px-3">Ingresos</TabsTrigger>
                <TabsTrigger value="conversion" className="text-xs sm:text-sm px-2 sm:px-3">Conv.</TabsTrigger>
                <TabsTrigger value="ltv" className="text-xs sm:text-sm px-2 sm:px-3">LTV</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview">
              <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
                {/* Bar Chart */}
                <div className="h-[200px] sm:h-80">
                  <ChartContainer config={{}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={metrics.slice(0, 8)} layout="vertical" margin={{ left: 0, right: 10 }}>
                        <XAxis type="number" stroke="#6b7280" fontSize={10} />
                        <YAxis 
                          dataKey="source" 
                          type="category" 
                          stroke="#6b7280" 
                          fontSize={10}
                          width={60}
                          tickFormatter={(value) => value.length > 8 ? value.slice(0, 8) + '...' : value}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar dataKey="registrations" name="Registros" fill="#71717a" stackId="stack" />
                        <Bar dataKey="trials" name="Pruebas" fill="#52525b" stackId="stack" />
                        <Bar dataKey="customers" name="Clientes" fill="#AA0601" stackId="stack" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>

                {/* Pie Chart */}
                <div className="h-[200px] sm:h-80">
                  <ChartContainer config={{}}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={60}
                          label={({ name, percent }) => `${name.slice(0,6)}: ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {pieData.map((_, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Legend wrapperStyle={{ fontSize: '10px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartContainer>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="revenue">
              <div className="h-[200px] sm:h-80">
                <ChartContainer config={{}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.slice(0, 10)} margin={{ left: 0, right: 10, bottom: 40 }}>
                      <XAxis 
                        dataKey="source" 
                        stroke="#6b7280" 
                        fontSize={10} 
                        angle={-45}
                        textAnchor="end"
                        height={60}
                        tickFormatter={(value) => value.length > 8 ? value.slice(0, 8) + '...' : value}
                      />
                      <YAxis stroke="#6b7280" fontSize={10} width={40} />
                      <ChartTooltip 
                        content={<ChartTooltipContent />}
                        formatter={(value) => [formatMoney(Number(value)), `Ingresos (${periodLabel})`]}
                      />
                      <Bar dataKey="revenue" name={`Ingresos (${periodLabel})`} fill="#AA0601" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            </TabsContent>

            <TabsContent value="conversion">
              <div className="h-[200px] sm:h-80">
                <ChartContainer config={{}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.slice(0, 10)} margin={{ left: 0, right: 10, bottom: 40 }}>
                      <XAxis 
                        dataKey="source" 
                        stroke="#6b7280" 
                        fontSize={10}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                        tickFormatter={(value) => value.length > 8 ? value.slice(0, 8) + '...' : value}
                      />
                      <YAxis stroke="#6b7280" fontSize={10} unit="%" width={35} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="conversionRate" name="Registro→Pago" fill="#AA0601" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="trialToPaid" name="Prueba→Pago" fill="#71717a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            </TabsContent>

            <TabsContent value="ltv">
              <div className="h-[200px] sm:h-80">
                <ChartContainer config={{}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.filter(m => m.ltv > 0).slice(0, 10)} margin={{ left: 0, right: 10, bottom: 40 }}>
                      <XAxis 
                        dataKey="source" 
                        stroke="#6b7280" 
                        fontSize={10}
                        angle={-45}
                        textAnchor="end"
                        height={60}
                        tickFormatter={(value) => value.length > 8 ? value.slice(0, 8) + '...' : value}
                      />
                      <YAxis stroke="#6b7280" fontSize={10} width={40} />
                      <ChartTooltip 
                        content={<ChartTooltipContent />}
                        formatter={(value) => [formatMoney(Number(value)), "LTV (promedio)"]}
                      />
                      <Bar dataKey="ltv" name="LTV (promedio)" fill="#AA0601" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </div>
            </TabsContent>
          </Tabs>

          {/* Table - Mobile optimized */}
          <div className="mt-4 sm:mt-6 overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
            <table className="w-full text-xs sm:text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 sm:py-3 px-1 sm:px-2 text-muted-foreground font-medium sticky left-0 bg-card">Fuente</th>
                  <th className="text-right py-2 sm:py-3 px-1 sm:px-2 text-muted-foreground font-medium">Reg.</th>
                  <th className="text-right py-2 sm:py-3 px-1 sm:px-2 text-muted-foreground font-medium">Pruebas</th>
                  <th className="text-right py-2 sm:py-3 px-1 sm:px-2 text-muted-foreground font-medium">Clientes</th>
                  <th className="text-right py-2 sm:py-3 px-1 sm:px-2 text-muted-foreground font-medium hidden sm:table-cell">Conv%</th>
                  <th className="text-right py-2 sm:py-3 px-1 sm:px-2 text-muted-foreground font-medium hidden sm:table-cell">LTV</th>
                  <th className="text-right py-2 sm:py-3 px-1 sm:px-2 text-muted-foreground font-medium">Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((row, idx) => (
                  <tr key={row.source} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 sm:py-3 px-1 sm:px-2 sticky left-0 bg-card">
                      <Badge 
                        variant="outline" 
                        className="text-[10px] sm:text-xs"
                        style={{ borderColor: COLORS[idx % COLORS.length], color: COLORS[idx % COLORS.length] }}
                      >
                        {row.source.length > 10 ? row.source.slice(0, 10) + '...' : row.source}
                      </Badge>
                    </td>
                    <td className="text-right py-2 sm:py-3 px-1 sm:px-2 text-foreground">{row.registrations}</td>
                    <td className="text-right py-2 sm:py-3 px-1 sm:px-2 text-amber-600 dark:text-amber-400">{row.trials}</td>
                    <td className="text-right py-2 sm:py-3 px-1 sm:px-2 text-emerald-600 dark:text-emerald-400">{row.customers}</td>
                    <td className="text-right py-2 sm:py-3 px-1 sm:px-2 text-sky-600 dark:text-sky-400 hidden sm:table-cell">{row.conversionRate}%</td>
                    <td className="text-right py-2 sm:py-3 px-1 sm:px-2 text-amber-600 dark:text-amber-400 hidden sm:table-cell">{row.ltv ? formatMoney(row.ltv) : "—"}</td>
                    <td className="text-right py-2 sm:py-3 px-1 sm:px-2 text-emerald-600 dark:text-emerald-400 font-medium">{row.revenue ? formatMoney(row.revenue) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
