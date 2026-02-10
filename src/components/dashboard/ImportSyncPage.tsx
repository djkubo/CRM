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

export function ImportSyncPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

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
                    const el = document.querySelector('[data-value=\"api\"]') as HTMLElement | null;
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
