import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Settings, Settings2, Zap, HardDrive, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// Lazy load heavy components for better performance
const SystemTogglesPanel = lazy(() => import('./SystemTogglesPanel'));
const IntegrationsStatusPanel = lazy(() => import('./IntegrationsStatusPanel').then(m => ({ default: m.IntegrationsStatusPanel })));
const GHLSettingsPanel = lazy(() => import('./GHLSettingsPanel'));
const MaintenancePanel = lazy(() => import('./MaintenancePanel'));

// Skeleton de carga premium
function SettingsSkeleton() {
  return (
    <div className="space-y-4 md:space-y-6">
      {/* Skeleton for each panel */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="card-base p-6">
          <div className="flex items-center gap-3 mb-4">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-40" />
          </div>
          <Skeleton className="h-4 w-64 mb-6" />
          <div className="space-y-4">
            {[1, 2, 3].map((j) => (
              <div key={j} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-5 w-5 rounded" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
                <Skeleton className="h-6 w-12 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const currentTab =
    tabParam === 'integrations' || tabParam === 'ghl' || tabParam === 'maintenance' || tabParam === 'system'
      ? tabParam
      : 'system';

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header - Responsive */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl md:text-3xl font-bold text-foreground flex items-center gap-2 md:gap-3">
            <Settings className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            Ajustes
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">
            Menos scroll, más claro: elige una sección y ajusta lo necesario.
          </p>
        </div>
      </div>

      {/* Quick actions */}
      <Card className="card-base">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">¿Qué quieres hacer?</CardTitle>
          <CardDescription>Accesos directos a lo más común.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <Button
            variant={currentTab === 'system' ? 'default' : 'outline'}
            className="justify-start gap-2"
            onClick={() => setSearchParams({ tab: 'system' }, { replace: true })}
          >
            <Settings2 className="h-4 w-4" />
            Sistema
          </Button>
          <Button
            variant={currentTab === 'integrations' ? 'default' : 'outline'}
            className="justify-start gap-2"
            onClick={() => setSearchParams({ tab: 'integrations' }, { replace: true })}
          >
            <Zap className="h-4 w-4" />
            Probar APIs
          </Button>
          <Button
            variant={currentTab === 'ghl' ? 'default' : 'outline'}
            className="justify-start gap-2"
            onClick={() => setSearchParams({ tab: 'ghl' }, { replace: true })}
          >
            <Users className="h-4 w-4" />
            GoHighLevel
          </Button>
          <Button
            variant={currentTab === 'maintenance' ? 'default' : 'outline'}
            className="justify-start gap-2"
            onClick={() => setSearchParams({ tab: 'maintenance' }, { replace: true })}
          >
            <HardDrive className="h-4 w-4" />
            Mantenimiento
          </Button>
        </CardContent>
      </Card>

      <Tabs
        value={currentTab}
        onValueChange={(v) => setSearchParams({ tab: v }, { replace: true })}
        className="space-y-4"
      >
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="bg-card border border-border/50 w-max sm:w-auto">
            <TabsTrigger value="system" className="gap-2 px-3 data-[state=active]:bg-primary/20">
              <Settings2 className="h-4 w-4" />
              Sistema
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-2 px-3 data-[state=active]:bg-primary/20">
              <Zap className="h-4 w-4" />
              Integraciones
            </TabsTrigger>
            <TabsTrigger value="ghl" className="gap-2 px-3 data-[state=active]:bg-primary/20">
              <Users className="h-4 w-4" />
              GoHighLevel
            </TabsTrigger>
            <TabsTrigger value="maintenance" className="gap-2 px-3 data-[state=active]:bg-primary/20">
              <HardDrive className="h-4 w-4" />
              Mantenimiento
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="system">
          {currentTab === 'system' && (
            <Suspense fallback={<SettingsSkeleton />}>
              <SystemTogglesPanel />
            </Suspense>
          )}
        </TabsContent>

        <TabsContent value="integrations">
          {currentTab === 'integrations' && (
            <Suspense fallback={<SettingsSkeleton />}>
              <IntegrationsStatusPanel />
            </Suspense>
          )}
        </TabsContent>

        <TabsContent value="ghl">
          {currentTab === 'ghl' && (
            <Suspense fallback={<SettingsSkeleton />}>
              <GHLSettingsPanel />
            </Suspense>
          )}
        </TabsContent>

        <TabsContent value="maintenance">
          {currentTab === 'maintenance' && (
            <Suspense fallback={<SettingsSkeleton />}>
              <MaintenancePanel />
            </Suspense>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
