import { useMemo } from "react";
import { format, subMonths, startOfMonth, endOfMonth, differenceInMonths } from "date-fns";
import { es } from "date-fns/locale";

interface Transaction {
  id: string;
  amount: number;
  status: string;
  stripe_created_at: string | null;
  customer_email: string | null;
}

interface CohortRetentionTableProps {
  transactions: Transaction[];
}

interface CohortData {
  cohortMonth: string;
  cohortDate: Date;
  totalUsers: number;
  retention: (number | null)[];
}

export function CohortRetentionTable({ transactions }: CohortRetentionTableProps) {
  const cohortData = useMemo(() => {
    const now = new Date();
    const cohorts: CohortData[] = [];

    // Build customer first payment dates
    const customerFirstPayment = new Map<string, Date>();
    const customerPaymentMonths = new Map<string, Set<string>>();

    for (const tx of transactions) {
      if (!tx.customer_email || !tx.stripe_created_at) continue;
      if (tx.status !== "succeeded" && tx.status !== "paid") continue;

      const email = tx.customer_email.toLowerCase();
      const txDate = new Date(tx.stripe_created_at);
      const monthKey = format(txDate, "yyyy-MM");

      // Track first payment
      if (!customerFirstPayment.has(email) || txDate < customerFirstPayment.get(email)!) {
        customerFirstPayment.set(email, txDate);
      }

      // Track all payment months
      if (!customerPaymentMonths.has(email)) {
        customerPaymentMonths.set(email, new Set());
      }
      customerPaymentMonths.get(email)!.add(monthKey);
    }

    // Create cohorts for last 6 months
    for (let i = 5; i >= 0; i--) {
      const cohortMonthDate = subMonths(now, i);
      const cohortStart = startOfMonth(cohortMonthDate);
      const cohortEnd = endOfMonth(cohortMonthDate);
      const cohortKey = format(cohortMonthDate, "yyyy-MM");

      // Find users whose first payment was in this cohort month
      const cohortUsers: string[] = [];
      customerFirstPayment.forEach((firstPayment, email) => {
        if (firstPayment >= cohortStart && firstPayment <= cohortEnd) {
          cohortUsers.push(email);
        }
      });

      if (cohortUsers.length === 0) {
        cohorts.push({
          cohortMonth: format(cohortMonthDate, "MMM yy", { locale: es }),
          cohortDate: cohortMonthDate,
          totalUsers: 0,
          retention: Array(12).fill(null),
        });
        continue;
      }

      // Calculate retention for each subsequent month
      const retention: (number | null)[] = [];
      const maxMonths = Math.min(12, differenceInMonths(now, cohortStart) + 1);

      for (let month = 0; month < 12; month++) {
        if (month >= maxMonths) {
          retention.push(null);
          continue;
        }

        const targetMonthDate = subMonths(now, i - month);
        const targetMonthKey = format(targetMonthDate, "yyyy-MM");

        let activeInMonth = 0;
        for (const email of cohortUsers) {
          const paymentMonths = customerPaymentMonths.get(email);
          if (paymentMonths?.has(targetMonthKey)) {
            activeInMonth++;
          }
        }

        const retentionRate = (activeInMonth / cohortUsers.length) * 100;
        retention.push(Math.round(retentionRate));
      }

      cohorts.push({
        cohortMonth: format(cohortMonthDate, "MMM yy", { locale: es }),
        cohortDate: cohortMonthDate,
        totalUsers: cohortUsers.length,
        retention,
      });
    }

    return cohorts;
  }, [transactions]);

  const getRetentionColor = (value: number | null): string => {
    if (value === null) return "bg-gray-800/30";
    if (value >= 80) return "bg-emerald-500/80 text-white";
    if (value >= 60) return "bg-emerald-500/60 text-white";
    if (value >= 40) return "bg-yellow-500/60 text-white";
    if (value >= 20) return "bg-orange-500/60 text-white";
    return "bg-rose-500/60 text-white";
  };

  return (
    <div className="rounded-xl border border-border/50 bg-[#1a1f36] p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white">Análisis de Cohortes</h3>
        <p className="text-sm text-muted-foreground">
          Retención de clientes por mes de adquisición (% activo)
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="text-left py-3 px-2 text-gray-400 font-medium sticky left-0 bg-[#1a1f36] z-10">
                Cohorte
              </th>
              <th className="text-center py-3 px-2 text-gray-400 font-medium">
                Usuarios
              </th>
              {Array.from({ length: 12 }, (_, i) => (
                <th
                  key={i}
                  className="text-center py-3 px-2 text-gray-400 font-medium min-w-[50px]"
                >
                  M{i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cohortData.map((cohort, idx) => (
              <tr key={idx} className="border-t border-gray-700/30">
                <td className="py-2 px-2 text-white font-medium sticky left-0 bg-[#1a1f36] z-10">
                  {cohort.cohortMonth}
                </td>
                <td className="py-2 px-2 text-center text-gray-300">
                  {cohort.totalUsers}
                </td>
                {cohort.retention.map((value, monthIdx) => (
                  <td key={monthIdx} className="py-2 px-1 text-center">
                    <div
                      className={`rounded px-2 py-1 text-xs font-medium ${getRetentionColor(
                        value
                      )}`}
                    >
                      {value !== null ? `${value}%` : "-"}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-emerald-500/80" />
          <span className="text-gray-400">80-100%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-emerald-500/60" />
          <span className="text-gray-400">60-79%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-yellow-500/60" />
          <span className="text-gray-400">40-59%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-orange-500/60" />
          <span className="text-gray-400">20-39%</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-rose-500/60" />
          <span className="text-gray-400">0-19%</span>
        </div>
      </div>
    </div>
  );
}
