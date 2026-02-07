import { Suspense, lazy } from 'react';
import { Settings, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

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
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      const { error } = await signOut();
      if (error) {
        toast.error("No se pudo cerrar sesión", {
          description: error.message,
        });
        return;
      }

      toast.success("Sesión cerrada");
      navigate("/login");
    } catch (err) {
      toast.error("No se pudo cerrar sesión", {
        description: err instanceof Error ? err.message : "Error inesperado",
      });
    }
  };

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
            Configuración e integraciones
          </p>
        </div>
        {user && (
          <div className="flex items-center gap-3 justify-between sm:justify-end">
            <span className="text-xs md:text-sm text-muted-foreground truncate max-w-[150px] md:max-w-none">{user.email}</span>
            <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2 touch-feedback shrink-0">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Cerrar Sesión</span>
              <span className="sm:hidden">Salir</span>
            </Button>
          </div>
        )}
      </div>

      {/* Panels with Suspense for lazy loading */}
      <Suspense fallback={<SettingsSkeleton />}>
        {/* System Toggles */}
        <SystemTogglesPanel />

        {/* Integrations Status */}
        <IntegrationsStatusPanel />

        {/* GHL Integration */}
        <GHLSettingsPanel />

        {/* Database Maintenance */}
        <MaintenancePanel />
      </Suspense>
    </div>
  );
}
