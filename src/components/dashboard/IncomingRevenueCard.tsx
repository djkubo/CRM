import { DollarSign, Clock, TrendingUp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface IncomingRevenueCardProps {
  totalNext72h: number;
  totalPending: number;
  breakdownNext72h: {
    usd: number;
    mxn: number;
    other: number;
    usdEquivalent: number;
  };
  invoiceCount: number;
  isLoading?: boolean;
}

export function IncomingRevenueCard({ 
  totalNext72h, 
  totalPending, 
  breakdownNext72h,
  invoiceCount,
  isLoading 
}: IncomingRevenueCardProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="rounded-xl border border-zinc-800 bg-card p-6 shadow-lg hover:border-zinc-700 transition-all duration-300">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-800 ring-2 ring-zinc-700">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Proyectado (Próx. 72h)
                  </p>
                  <div className="flex items-baseline gap-2">
                    {isLoading ? (
                      <div className="h-8 w-24 animate-pulse rounded bg-zinc-800" />
                    ) : (
                      <>
                        <p className="text-2xl font-bold text-white">
                          ${totalNext72h.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </p>
                        <span className="text-xs text-muted-foreground">USD eq.</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="text-right">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-xs">{invoiceCount} facturas</span>
                </div>
                {totalPending > totalNext72h && (
                  <p className="text-xs text-muted-foreground mt-1">
                    +${(totalPending - totalNext72h).toFixed(2)} después
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-1">
                  USD ${breakdownNext72h.usd.toFixed(0)} · MXN ${breakdownNext72h.mxn.toFixed(0)}
                </p>
              </div>
            </div>

            {/* Progress indicator */}
            <div className="mt-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Próximas 72h</span>
                <span>Total pendiente: ${totalPending.toFixed(2)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <div 
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ 
                    width: totalPending > 0 
                      ? `${Math.min((totalNext72h / totalPending) * 100, 100)}%` 
                      : '0%' 
                  }}
                />
              </div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs bg-card border-zinc-700">
          <div className="space-y-2 p-1">
            <p className="font-medium text-white">💰 Dinero en Camino</p>
            <p className="text-sm text-muted-foreground">
              Facturas en estado <span className="text-white">draft</span> u <span className="text-white">open</span> que Stripe cobrará automáticamente según tus reglas de facturación (3 días de gracia).
            </p>
            <p className="text-xs text-muted-foreground">
              Puedes cobrar manualmente desde la tabla de Cobros Pendientes.
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
