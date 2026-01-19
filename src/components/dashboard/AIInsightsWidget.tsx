import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, TrendingUp, AlertTriangle, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface AIInsight {
  id: string;
  date: string;
  summary: string;
  opportunities: Array<{ title: string; description: string; potential: string }>;
  risks: Array<{ title: string; description: string; severity: string }>;
  metrics: Record<string, unknown>;
  created_at: string;
}

export function AIInsightsWidget() {
  const { data: insight, isLoading, error } = useQuery({
    queryKey: ["ai-insights-latest"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_insights")
        .select("*")
        .order("date", { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      return data as AIInsight;
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/50 bg-gradient-to-br from-[#1a1f36] to-[#0f1225] p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Cargando insights...</span>
        </div>
      </div>
    );
  }

  if (error || !insight) {
    return (
      <div className="rounded-xl border border-border/50 bg-gradient-to-br from-[#1a1f36] to-[#0f1225] p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">El Oráculo</h3>
            <p className="text-sm text-muted-foreground">Análisis IA de tu negocio</p>
          </div>
        </div>
        <div className="text-center py-6 text-muted-foreground">
          <p>No hay análisis disponible aún.</p>
          <p className="text-sm mt-1">Ejecuta el análisis desde la pestaña Analytics.</p>
        </div>
      </div>
    );
  }

  const opportunities = Array.isArray(insight.opportunities) ? insight.opportunities : [];
  const risks = Array.isArray(insight.risks) ? insight.risks : [];

  return (
    <div className="rounded-xl border border-border/50 bg-gradient-to-br from-[#1a1f36] via-[#1a1f36] to-primary/5 p-6 relative overflow-hidden">
      {/* Glow effect */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-6 relative">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">El Oráculo</h3>
            <p className="text-sm text-muted-foreground">
              Análisis del {format(new Date(insight.date), "d 'de' MMMM, yyyy", { locale: es })}
            </p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-6 p-4 rounded-lg bg-background/50 border border-border/30">
        <p className="text-foreground leading-relaxed">{insight.summary}</p>
      </div>

      {/* Opportunities & Risks Grid */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Opportunities */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-400">
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm font-semibold uppercase tracking-wider">Oportunidades</span>
          </div>
          {opportunities.length > 0 ? (
            opportunities.slice(0, 3).map((opp, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                <p className="font-medium text-emerald-300 text-sm">{opp.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{opp.description}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Sin oportunidades detectadas</p>
          )}
        </div>

        {/* Risks */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-semibold uppercase tracking-wider">Riesgos</span>
          </div>
          {risks.length > 0 ? (
            risks.slice(0, 3).map((risk, idx) => (
              <div key={idx} className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                <p className="font-medium text-amber-300 text-sm">{risk.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{risk.description}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">Sin riesgos detectados</p>
          )}
        </div>
      </div>
    </div>
  );
}
