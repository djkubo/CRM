import { Upload, RefreshCw, FileText, Database, Users, Shield, ArrowRight } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CSVUploader } from './CSVUploader';
import { APISyncPanel } from './APISyncPanel';
import { SmartRecoveryCard } from './SmartRecoveryCard';
import { SyncOrchestrator } from './SyncOrchestrator';
import { SyncResultsPanel } from './SyncResultsPanel';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { APP_PATHS } from '@/config/appPaths';
import { Badge } from '@/components/ui/badge';
import { useSyncState, indexSyncState, type SyncSource } from '@/hooks/useSyncState';
import { getFreshnessBucket, getRecommendedRangeAction } from '@/lib/syncStateUtils';
import { setPendingOpsSyncCommand } from '@/lib/opsSyncCommand';
import { formatDistanceToNow, format } from 'date-fns';
import { es } from 'date-fns/locale';

export function ImportSyncPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: syncStateRows, isLoading: syncStateLoading } = useSyncState();
  const syncState = indexSyncState(syncStateRows);

  const handleProcessingComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    queryClient.invalidateQueries({ queryKey: ['clients-count'] });
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['metrics'] });
    queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-3xl font-bold text-foreground flex items-center gap-2 sm:gap-3">
            <Upload className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            Importar / Sincronizar
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Trae datos (Stripe/PayPal/GHL/ManyChat/CSV) y resuelve atascos sin perder avance.
          </p>
        </div>
      </div>

      {/* Sync Status Panel - Shows active and recent syncs */}
      <SyncResultsPanel />

      <Tabs defaultValue="overview" className="space-y-4 sm:space-y-6">
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="bg-card border border-border/50 w-max sm:w-auto">
            <TabsTrigger value="overview" className="gap-1.5 sm:gap-2 text-xs sm:text-sm px-2.5 sm:px-3 data-[state=active]:bg-primary/20">
              <Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Resumen
            </TabsTrigger>
            <TabsTrigger value="api" className="gap-1.5 sm:gap-2 text-xs sm:text-sm px-2.5 sm:px-3 data-[state=active]:bg-primary/20">
              <Database className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Sincronizar
            </TabsTrigger>
            <TabsTrigger value="csv" className="gap-1.5 sm:gap-2 text-xs sm:text-sm px-2.5 sm:px-3 data-[state=active]:bg-primary/20">
              <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Importar CSV
            </TabsTrigger>
            <TabsTrigger value="recovery" className="gap-1.5 sm:gap-2 text-xs sm:text-sm px-2.5 sm:px-3 data-[state=active]:bg-primary/20">
              <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Recuperación
            </TabsTrigger>
            <TabsTrigger value="unify" className="gap-1.5 sm:gap-2 text-xs sm:text-sm px-2.5 sm:px-3 data-[state=active]:bg-primary/20">
              <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Unificar identidad
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <div className="grid gap-3 lg:grid-cols-3">
            <Card className="border-border/50">
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">Primera vez</p>
                <p className="text-xs text-muted-foreground">
                  Empieza con <span className="font-medium">Stripe + PayPal</span>. Luego sincroniza CRM (GHL/ManyChat) si lo necesitas.
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-2"
                  onClick={() => {
                    const el = document.querySelector('[data-value="api"]') as HTMLElement | null;
                    el?.click();
                  }}
                >
                  <ArrowRight className="h-4 w-4" />
                  Abrir Sincronizar
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">Se atoro o quedó en X</p>
                <p className="text-xs text-muted-foreground">
                  No canceles todo: usa <span className="font-medium">Cancelar</span> o <span className="font-medium">Reanudar</span> por corrida en “Estado de Sincronización”.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                >
                  <ArrowRight className="h-4 w-4" />
                  Ver estado arriba
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium text-foreground">Validar resultados</p>
                <p className="text-xs text-muted-foreground">
                  Después de sincronizar, revisa diferencias y calidad de datos en Diagnóstico.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2"
                  onClick={() => navigate(APP_PATHS.diagnostics)}
                >
                  <ArrowRight className="h-4 w-4" />
                  Abrir Diagnóstico
                </Button>
              </CardContent>
            </Card>

            <Card className="border-border/50 lg:col-span-3">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Estado de datos</p>
                    <p className="text-xs text-muted-foreground">
                      Cobertura (backfill) + frescura (hasta qué fecha está al día). Esto se guarda aunque <span className="font-medium">sync_runs</span> se limpie.
                    </p>
                  </div>
                  {syncStateLoading ? (
                    <Badge variant="outline" className="text-muted-foreground">Cargando…</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">Actualiza cada 60s</Badge>
                  )}
                </div>

                <div className="mt-3 grid gap-2">
                  {([
                    { source: "stripe", label: "Stripe" },
                    { source: "paypal", label: "PayPal" },
                    { source: "stripe_invoices", label: "Facturas" },
                    { source: "ghl", label: "GoHighLevel" },
                    { source: "manychat", label: "ManyChat" },
                  ] as Array<{ source: SyncSource; label: string }>).map(({ source, label }) => {
                    const row = syncState[source];
                    const bucket = getFreshnessBucket(row?.fresh_until ?? null);
                    const badgeClass =
                      bucket === "green"
                        ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                        : bucket === "yellow"
                          ? "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                          : "bg-red-500/15 text-red-400 border border-red-500/25";

                    const isRangeSource = source === "stripe" || source === "paypal" || source === "stripe_invoices";
                    const action = isRangeSource
                      ? getRecommendedRangeAction(bucket)
                      : bucket === "green"
                        ? { mode: null, label: "No hace falta" as const }
                        : { mode: "now", label: "Correr" as const };

                    const freshText = row?.fresh_until
                      ? `Al día hasta: ${format(new Date(row.fresh_until), "PPp", { locale: es })} (${formatDistanceToNow(new Date(row.fresh_until), { addSuffix: true, locale: es })})`
                      : "Sin historial de sync (aún)";

                    const backfillText =
                      isRangeSource && row?.backfill_start
                        ? `Backfill desde: ${format(new Date(row.backfill_start), "PPp", { locale: es })}`
                        : null;

                    const isDisabled = action.mode === null;

                    return (
                      <div key={source} className="rounded-lg border border-border/50 bg-muted/20 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground">{label}</p>
                              <Badge className={badgeClass}>
                                {bucket === "green" ? "OK" : bucket === "yellow" ? "Atención" : "Urgente"}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground break-words">{freshText}</p>
                            {backfillText && <p className="mt-0.5 text-xs text-muted-foreground break-words">{backfillText}</p>}
                          </div>

                          <Button
                            size="sm"
                            variant={isDisabled ? "outline" : "secondary"}
                            disabled={isDisabled}
                            onClick={() => {
                              if (!action.mode) return;
                              setPendingOpsSyncCommand({ source, mode: action.mode });
                              const el = document.querySelector('[data-value="api"]') as HTMLElement | null;
                              el?.click();
                            }}
                            className="gap-2 self-start sm:self-auto"
                          >
                            <ArrowRight className="h-4 w-4" />
                            {action.label}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="api">
          <APISyncPanel />
        </TabsContent>

        <TabsContent value="csv">
          <CSVUploader onProcessingComplete={handleProcessingComplete} />
        </TabsContent>

        <TabsContent value="recovery">
          <SmartRecoveryCard />
        </TabsContent>

        <TabsContent value="unify">
          <SyncOrchestrator />
        </TabsContent>
      </Tabs>
    </div>
  );
}
