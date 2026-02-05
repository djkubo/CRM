import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PipelineType = "recovery" | "trial" | "winback";

export interface BotAction {
  action: string;
  sent_at: string;
  channel: string | null;
}

export interface PipelineClient {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  phone_e164: string | null;
  lifecycle_stage: string | null;
  revenue_score: number | null;
  total_spend: number | null;
  revenue_at_risk: number;
  queue_status: string | null;
  retry_at: string | null;
  attempt_count: number | null;
  last_attempt_at: string | null;
  notification_sent_at: string | null;
  notification_channel: string | null;
  pipeline_type: string;
  last_contact_at: string | null;
  days_until_expiry?: number | null;
  trial_end?: string | null;
  // New bot tracking fields
  last_bot_action: BotAction | null;
  total_outreach_count: number;
}

export interface PipelineSummary {
  total_debt: number;
  total_trials_expiring: number;
  total_winback: number;
  recovery_count: number;
  trial_count: number;
  winback_count: number;
}

export interface PipelineResult {
  summary: PipelineSummary;
  items: PipelineClient[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
}

interface UseRevenuePipelineOptions {
  type: PipelineType;
  page: number;
  pageSize: number;
  showOnlyWithPhone?: boolean;
  enabled?: boolean;
}

export function useRevenuePipeline({
  type,
  page,
  pageSize,
  showOnlyWithPhone = false,
  enabled = true,
}: UseRevenuePipelineOptions) {
  const offset = (page - 1) * pageSize;

  return useQuery({
    queryKey: ["revenue-pipeline", type, page, pageSize, showOnlyWithPhone],
    queryFn: async (): Promise<PipelineResult> => {
      // Call the server-side RPC with phone filter
      const { data, error } = await supabase.rpc(
        "get_revenue_pipeline_stats" as any,
        {
          p_type: type,
          p_limit: pageSize,
          p_offset: offset,
          p_phone_only: showOnlyWithPhone,
        }
      );

      if (error) {
        console.error("[RevenuePipeline] RPC error:", error);
        throw new Error(error.message);
      }

      return data as PipelineResult;
    },
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

// Separate hook for just the summary (used in header metrics)
export function usePipelineSummary() {
  return useQuery({
    queryKey: ["revenue-pipeline-summary"],
    queryFn: async (): Promise<PipelineSummary> => {
      const { data, error } = await supabase.rpc(
        "get_revenue_pipeline_stats" as any,
        {
          p_type: "recovery",
          p_limit: 1,
          p_offset: 0,
        }
      );

      if (error) {
        throw new Error(error.message);
      }

      return (data as PipelineResult).summary;
    },
    staleTime: 60_000, // 1 minute
  });
}
