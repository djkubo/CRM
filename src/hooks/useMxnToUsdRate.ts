import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_MXN_TO_USD_RATE } from "@/lib/currency";

export function useMxnToUsdRate() {
  return useQuery({
    queryKey: ["fx-rate", "mxn-usd"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_exchange_rate", {
        p_base: "MXN",
        p_target: "USD",
      });

      if (error) {
        throw error;
      }

      if (typeof data === "number" && data > 0) {
        return data;
      }

      return DEFAULT_MXN_TO_USD_RATE;
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 30 * 60 * 1000,
    retry: false,
  });
}
