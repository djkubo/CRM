import { useMemo } from "react";
import { DollarSign, TrendingUp, Users, Calendar } from "lucide-react";
import { subMonths, startOfMonth, endOfMonth, format } from "date-fns";

interface Transaction {
  id: string;
  amount: number;
  status: string;
  stripe_created_at: string | null;
  customer_email: string | null;
}

interface LTVMetricsProps {
  transactions: Transaction[];
}

export function LTVMetrics({ transactions }: LTVMetricsProps) {
  const metrics = useMemo(() => {
    const now = new Date();
    const currentMonthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    // Get successful transactions
    const successfulTx = transactions.filter(
      (tx) =>
        tx.status === "succeeded" ||
        tx.status === "paid"
    );

    // Calculate MRR (Monthly Recurring Revenue) - last month's revenue
    const lastMonthTx = successfulTx.filter((tx) => {
      if (!tx.stripe_created_at) return false;
      const txDate = new Date(tx.stripe_created_at);
      return txDate >= lastMonthStart && txDate <= lastMonthEnd;
    });

    const mrr = lastMonthTx.reduce((sum, tx) => sum + tx.amount / 100, 0);

    // Get unique paying customers last month
    const lastMonthCustomers = new Set(
      lastMonthTx
        .filter((tx) => tx.customer_email)
        .map((tx) => tx.customer_email!.toLowerCase())
    );
    const activeCustomers = lastMonthCustomers.size;

    // Calculate ARPU (Average Revenue Per User)
    const arpu = activeCustomers > 0 ? mrr / activeCustomers : 0;

    // Calculate User Churn Rate
    // Compare active customers 2 months ago vs those who churned last month
    const twoMonthsAgoStart = startOfMonth(subMonths(now, 2));
    const twoMonthsAgoEnd = endOfMonth(subMonths(now, 2));

    const twoMonthsAgoCustomers = new Set(
      successfulTx
        .filter((tx) => {
          if (!tx.stripe_created_at || !tx.customer_email) return false;
          const txDate = new Date(tx.stripe_created_at);
          return txDate >= twoMonthsAgoStart && txDate <= twoMonthsAgoEnd;
        })
        .map((tx) => tx.customer_email!.toLowerCase())
    );

    // Churned = customers from 2 months ago who didn't pay last month
    let churnedCount = 0;
    twoMonthsAgoCustomers.forEach((email) => {
      if (!lastMonthCustomers.has(email)) {
        churnedCount++;
      }
    });

    const churnRate =
      twoMonthsAgoCustomers.size > 0
        ? (churnedCount / twoMonthsAgoCustomers.size) * 100
        : 0;

    // Calculate LTV (Lifetime Value) = ARPU / Churn Rate
    // If churn rate is 0, use a minimum of 5% to avoid infinity
    const effectiveChurnRate = Math.max(churnRate, 5) / 100;
    const ltv = arpu / effectiveChurnRate;

    // Calculate LTV:CAC ratio (assuming CAC is ~1 month revenue for simplicity)
    // This is a simplified estimate
    const estimatedCAC = arpu * 0.3; // Assume 30% of ARPU goes to acquisition
    const ltvCacRatio = estimatedCAC > 0 ? ltv / estimatedCAC : 0;

    // Calculate average customer lifespan in months
    const avgLifespanMonths = churnRate > 0 ? 100 / churnRate : 20;

    return {
      mrr,
      arpu,
      churnRate,
      ltv,
      ltvCacRatio,
      activeCustomers,
      avgLifespanMonths,
    };
  }, [transactions]);

  const MetricCard = ({
    icon: Icon,
    label,
    value,
    subtext,
    color,
  }: {
    icon: any;
    label: string;
    value: string;
    subtext?: string;
    color: string;
  }) => (
    <div className="rounded-xl border border-border/50 bg-[#1a1f36] p-5 hover:border-primary/30 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div
          className={`p-2.5 rounded-lg ${color}`}
        >
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
      {subtext && (
        <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Métricas de LTV</h3>
          <p className="text-sm text-muted-foreground">
            Fórmula ChartMogul: ARPU / User Churn Rate
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={DollarSign}
          label="LTV (Lifetime Value)"
          value={`$${metrics.ltv.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}`}
          subtext="Valor total por cliente"
          color="bg-emerald-500/20 text-emerald-400"
        />

        <MetricCard
          icon={TrendingUp}
          label="MRR (Monthly Revenue)"
          value={`$${metrics.mrr.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          })}`}
          subtext="Ingresos del último mes"
          color="bg-indigo-500/20 text-indigo-400"
        />

        <MetricCard
          icon={Users}
          label="ARPU"
          value={`$${metrics.arpu.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          subtext={`${metrics.activeCustomers} clientes activos`}
          color="bg-purple-500/20 text-purple-400"
        />

        <MetricCard
          icon={Calendar}
          label="Churn Rate"
          value={`${metrics.churnRate.toFixed(1)}%`}
          subtext={`~${metrics.avgLifespanMonths.toFixed(0)} meses vida promedio`}
          color="bg-rose-500/20 text-rose-400"
        />
      </div>

      {/* LTV Formula Explanation */}
      <div className="rounded-lg bg-gray-800/30 border border-gray-700/50 p-4 mt-4">
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-400">LTV =</span>
            <span className="font-mono text-primary">
              ${metrics.arpu.toFixed(2)}
            </span>
            <span className="text-gray-500">(ARPU)</span>
            <span className="text-gray-400">÷</span>
            <span className="font-mono text-rose-400">
              {(Math.max(metrics.churnRate, 5) / 100).toFixed(2)}
            </span>
            <span className="text-gray-500">(Churn)</span>
            <span className="text-gray-400">=</span>
            <span className="font-mono font-bold text-emerald-400">
              ${metrics.ltv.toFixed(0)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
