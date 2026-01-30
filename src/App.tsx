import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import ErrorBoundary from "@/components/ErrorBoundary";
import { OfflineBanner } from "@/components/OfflineIndicator";
import { QueryErrorHandler } from "@/components/QueryErrorHandler";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";

// Pages
import Login from "./pages/Login";
import Install from "./pages/Install";
import UpdateCard from "./pages/UpdateCard";
import UpdateCardSuccess from "./pages/UpdateCardSuccess";
import NotFound from "./pages/NotFound";

// Dashboard pages - eager load core pages
import { DashboardHome } from "@/components/dashboard/DashboardHome";
import { ClientsPage } from "@/components/dashboard/ClientsPage";
import { InvoicesPage } from "@/components/dashboard/InvoicesPage";
import { SubscriptionsPage } from "@/components/dashboard/SubscriptionsPage";
import { MovementsPage } from "@/components/dashboard/MovementsPage";
import { RevenueOpsPipeline } from "@/components/dashboard/RevenueOpsPipeline";
import { ImportSyncPage } from "@/components/dashboard/ImportSyncPage";
import { SettingsPage } from "@/components/dashboard/SettingsPage";
import { CampaignControlCenter } from "@/components/dashboard/CampaignControlCenter";
import { FlowsPage } from "@/components/dashboard/FlowsPage";
import { BroadcastListsPage } from "@/components/broadcast/BroadcastListsPage";
import { WhatsAppSettingsPage } from "@/components/dashboard/WhatsAppSettingsPage";
import DiagnosticsPanel from "@/components/dashboard/DiagnosticsPanel";
import MessagesPageWrapper from "@/components/dashboard/MessagesPageWrapper";

// Lazy load heavy analytics page
const AnalyticsPanel = lazy(() => 
  import("@/components/dashboard/analytics/AnalyticsPanel").then(m => ({ default: m.AnalyticsPanel }))
);

const AnalyticsSkeleton = () => (
  <div className="space-y-6">
    <Skeleton className="h-12 w-64" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
      <Skeleton className="h-32" />
    </div>
    <Skeleton className="h-64" />
  </div>
);

// Optimized QueryClient for performance and stability
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        // Don't retry on auth errors
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        if (message.includes('unauthorized') || message.includes('401') || message.includes('jwt')) {
          return false;
        }
        // Max 2 retries for other errors
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      staleTime: 60000, // 60 seconds - reduces redundant fetches
      gcTime: 300000, // 5 minutes garbage collection
      refetchOnWindowFocus: false, // Prevent saturation on tab switch
      refetchOnReconnect: true, // Refresh when back online
    },
    mutations: {
      retry: 1,
    },
  },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center safe-area-top safe-area-bottom">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center safe-area-top safe-area-bottom">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }
  
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <OfflineBanner />
        <QueryErrorHandler />
        <BrowserRouter>
          <Routes>
            {/* Protected Dashboard Routes */}
            <Route 
              element={
                <ProtectedRoute>
                  <ErrorBoundary>
                    <DashboardLayout />
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardHome />} />
              <Route path="movements" element={<MovementsPage />} />
              <Route path="analytics" element={
                <Suspense fallback={<AnalyticsSkeleton />}>
                  <AnalyticsPanel />
                </Suspense>
              } />
              <Route path="messages" element={<MessagesPageWrapper />} />
              <Route path="campaigns" element={<CampaignControlCenter />} />
              <Route path="broadcast" element={<BroadcastListsPage />} />
              <Route path="flows" element={<FlowsPage />} />
              <Route path="whatsapp" element={<WhatsAppSettingsPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="invoices" element={<InvoicesPage />} />
              <Route path="subscriptions" element={<SubscriptionsPage />} />
              <Route path="recovery" element={<RevenueOpsPipeline />} />
              <Route path="import" element={<ImportSyncPage />} />
              <Route path="diagnostics" element={<DiagnosticsPanel />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>

            {/* Public Routes */}
            <Route 
              path="/login" 
              element={
                <PublicRoute>
                  <ErrorBoundary>
                    <Login />
                  </ErrorBoundary>
                </PublicRoute>
              } 
            />
            <Route path="/install" element={<Install />} />
            <Route path="/update-card" element={<UpdateCard />} />
            <Route path="/update-card/success" element={<UpdateCardSuccess />} />
            
            {/* Catch-all */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
