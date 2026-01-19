import { MRRMovementsChart } from "./MRRMovementsChart";
import { CohortRetentionTable } from "./CohortRetentionTable";
import { LTVMetrics } from "./LTVMetrics";
import { Transaction } from "@/hooks/useTransactions";
import { Client } from "@/hooks/useClients";

interface AnalyticsPanelProps {
  transactions: Transaction[];
  clients: Client[];
}

export function AnalyticsPanel({ transactions, clients }: AnalyticsPanelProps) {
  return (
    <div className="space-y-6">
      {/* LTV Metrics Row */}
      <LTVMetrics transactions={transactions} />

      {/* MRR Movements Chart */}
      <MRRMovementsChart transactions={transactions} clients={clients} />

      {/* Cohort Retention Table */}
      <CohortRetentionTable transactions={transactions} />
    </div>
  );
}
