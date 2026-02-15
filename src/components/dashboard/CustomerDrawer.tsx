import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeWithAdminKey } from '@/lib/adminApi';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Mail,
  Phone,
  MessageCircle,
  ExternalLink,
  Crown,
  AlertTriangle,
  Calendar,
  DollarSign,
  CreditCard,
  CheckCircle2,
  XCircle,
  Play,
  ArrowUpCircle,
  Check,
  Loader2,
  FileText,
  RefreshCw,
  Send,
  Clock,
} from 'lucide-react';
import { openWhatsApp, getRecoveryMessage, getGreetingMessage } from './RecoveryTable';
import { useToast } from '@/hooks/use-toast';
import type { Client } from '@/hooks/useClients';

interface CustomerDrawerProps {
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debtAmount?: number;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Play }> = {
  trialing: { label: 'En prueba', color: 'text-foreground bg-zinc-800 border-zinc-700', icon: Play },
  active: { label: 'Activo', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', icon: CheckCircle2 },
  past_due: { label: 'Pago Vencido', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30', icon: AlertTriangle },
  canceled: { label: 'Cancelado', color: 'text-red-400 bg-red-500/10 border-red-500/30', icon: XCircle },
  customer: { label: 'Cliente', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', icon: CheckCircle2 },
  lead: { label: 'Lead', color: 'text-zinc-400 bg-zinc-800 border-zinc-700', icon: Play },
  churn: { label: 'Baja', color: 'text-red-400 bg-red-500/10 border-red-500/30', icon: XCircle },
  trial: { label: 'Prueba', color: 'text-foreground bg-zinc-800 border-zinc-700', icon: Play },
};

const eventIcons: Record<string, { icon: typeof Mail; color: string }> = {
  email_open: { icon: Mail, color: 'text-foreground' },
  email_click: { icon: ExternalLink, color: 'text-primary' },
  payment_failed: { icon: CreditCard, color: 'text-red-400' },
  payment_success: { icon: CheckCircle2, color: 'text-emerald-400' },
  trial_started: { icon: Play, color: 'text-foreground' },
  trial_converted: { icon: ArrowUpCircle, color: 'text-emerald-400' },
};

export function CustomerDrawer({ client, open, onOpenChange, debtAmount = 0 }: CustomerDrawerProps) {
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const { toast } = useToast();

  // Single "Client 360" RPC: unify all data per client (stripe/paypal/ghl/manychat).
  const { data: client360, isLoading: isLoading360, error: error360, refetch: refetch360 } = useQuery({
    queryKey: ['client-360', client?.id],
    queryFn: async () => {
      if (!client?.id) return null;
      const { data, error } = await supabase.rpc('get_client_360', {
        p_client_id: client.id,
        // Default limits are already safe server-side; we can override if needed.
        p_limits: {
          transactions: 1000,
          chat_events: 500,
        },
      });
      if (error) throw error;
      const payload = data as unknown as { success?: boolean; error?: string };
      if (payload && payload.success === false) throw new Error(payload.error || 'get_client_360 failed');
      return data;
    },
    enabled: open && !!client?.id,
    staleTime: 30_000,
  });

  if (!client) return null;

  const c360 = client360 as any | null;
  const events = (c360?.client_events || []) as any[];
  const leadEvents = (c360?.lead_events || []) as any[];
  const transactions = (c360?.transactions || []) as any[];
  const invoices = (c360?.invoices || []) as any[];
  const subscriptions = (c360?.subscriptions || []) as any[];
  const messages = (c360?.messages || []) as any[];
  const disputes = (c360?.disputes || []) as any[];
  const paypalSubscriptions = (c360?.paypal_subscriptions || []) as any[];
  const conversations = (c360?.conversations || []) as any[];
  const chatEvents = (c360?.chat_events || []) as any[];
  const scheduledMessages = (c360?.scheduled_messages || []) as any[];
  const flowExecutions = (c360?.flow_executions || []) as any[];
  const mergeConflicts = (c360?.merge_conflicts || []) as any[];

  const handlePortalLink = async () => {
    if (!client.stripe_customer_id) {
      toast({ title: 'Sin Stripe ID', variant: 'destructive' });
      return;
    }
    setLoadingPortal(true);
    try {
      const data = await invokeWithAdminKey<{ url?: string }>('create-portal-session', {
        stripe_customer_id: client.stripe_customer_id, 
        return_url: window.location.origin 
      });
      if (data?.url) {
        await navigator.clipboard.writeText(data.url);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
        toast({ title: 'Link copiado al portapapeles' });
      }
    } catch (error) {
      toast({ title: 'Error generando link', variant: 'destructive' });
    } finally {
      setLoadingPortal(false);
    }
  };

  const handleWhatsApp = () => {
    if (!client.phone) return;
    const message = debtAmount > 0
      ? getRecoveryMessage(client.full_name || '', debtAmount)
      : getGreetingMessage(client.full_name || '');
    openWhatsApp(client.phone, client.full_name || '', message);
  };

  const lifecycleStage = client.lifecycle_stage?.toLowerCase() || 'lead';
  const status = statusConfig[lifecycleStage] || statusConfig.lead;
  const StatusIcon = status.icon;
  
  // Prefer server-side LTV computed from all matching transactions (not just the limited list).
  const ltvPaidCents = typeof c360?.metrics?.ltv_paid_cents === 'number'
    ? c360.metrics.ltv_paid_cents
    : (parseInt(c360?.metrics?.ltv_paid_cents ?? '0', 10) || 0);
  
  const totalSpendUSD = (ltvPaidCents > 0 ? ltvPaidCents : (client.total_spend || 0)) / 100;
  const isVip = totalSpendUSD >= 1000;
  const totalTransactions = (c360?.counts?.transactions ?? transactions.length ?? 0) as number;

  // Combine timeline data (includes ALL transactions now)
  const timelineItems = [
    // Registration
    client.created_at && {
      type: 'registration',
      date: client.created_at,
      label: 'Registro',
      icon: Calendar,
      color: 'text-blue-400',
    },
    // First seen (lead)
    client.first_seen_at && client.first_seen_at !== client.created_at && {
      type: 'lead',
      date: client.first_seen_at,
      label: `Lead desde ${client.acquisition_source || 'desconocido'}`,
      icon: Play,
      color: 'text-cyan-400',
    },
    // Trial started
    client.trial_started_at && {
      type: 'trial',
      date: client.trial_started_at,
      label: 'Inicio de prueba',
      icon: Play,
      color: 'text-purple-400',
    },
    // Conversion
    client.converted_at && {
      type: 'conversion',
      date: client.converted_at,
      label: 'Conversión a Pago',
      icon: ArrowUpCircle,
      color: 'text-emerald-400',
    },
    // Lead events
    ...(leadEvents?.map((e) => ({
      type: 'lead_event',
      date: e.processed_at,
      label: `${e.event_type} (${e.source})`,
      icon: Play,
      color: 'text-cyan-400',
    })) || []),
    // Events
    ...(events?.map((e) => ({
      type: 'event',
      date: e.created_at,
      label: e.event_type.replace(/_/g, ' '),
      icon: eventIcons[e.event_type]?.icon || Mail,
      color: eventIcons[e.event_type]?.color || 'text-gray-400',
      metadata: e.metadata,
    })) || []),
    // ALL Transactions (no limit)
    ...(transactions?.map((t) => ({
      type: 'transaction',
      date: t.stripe_created_at || t.created_at,
      label: t.status === 'paid' || t.status === 'succeeded' ? 'Pago exitoso' : t.status === 'failed' ? 'Pago fallido' : t.status,
      icon: t.status === 'failed' ? CreditCard : CheckCircle2,
      color: t.status === 'failed' ? 'text-red-400' : 'text-emerald-400',
      amount: t.amount / 100,
      currency: t.currency,
      source: t.source,
    })) || []),
  ].filter(Boolean).sort((a, b) => new Date(b!.date).getTime() - new Date(a!.date).getTime());

  const getSubscriptionStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10';
      case 'trialing': return 'text-white border-zinc-700 bg-zinc-800';
      case 'past_due': return 'text-amber-400 border-amber-500/30 bg-amber-500/10';
      case 'unpaid': return 'text-red-400 border-red-500/30 bg-red-500/10';
      default: return 'text-zinc-400 border-zinc-700 bg-zinc-800';
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg bg-card border-border p-4 sm:p-6">
        <SheetHeader className="pb-3 sm:pb-4">
          <SheetTitle className="flex items-center gap-2 sm:gap-3">
            <div className={`flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-full ${isVip ? 'bg-yellow-500/20' : 'bg-primary/10'} shrink-0`}>
              <span className={`text-sm sm:text-lg font-medium ${isVip ? 'text-yellow-500' : 'text-primary'}`}>
                {client.full_name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-foreground text-sm sm:text-base truncate">{client.full_name || 'Sin nombre'}</span>
                {isVip && <Crown className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-yellow-500 shrink-0" />}
              </div>
              <Badge variant="outline" className={`text-[10px] sm:text-xs ${status.color}`}>
                <StatusIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                {status.label}
              </Badge>
            </div>
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-160px)] sm:h-[calc(100vh-200px)] pr-2 sm:pr-4">
          <Tabs defaultValue="overview" className="w-full">
            <div className="flex items-center justify-between gap-2 mb-3">
              <TabsList className="grid grid-cols-5 w-full">
                <TabsTrigger value="overview" className="text-[10px] sm:text-xs">Resumen</TabsTrigger>
                <TabsTrigger value="finance" className="text-[10px] sm:text-xs">Finanzas</TabsTrigger>
                <TabsTrigger value="chat" className="text-[10px] sm:text-xs">Chat</TabsTrigger>
                <TabsTrigger value="ops" className="text-[10px] sm:text-xs">Ops</TabsTrigger>
                <TabsTrigger value="json" className="text-[10px] sm:text-xs">JSON</TabsTrigger>
              </TabsList>
            </div>

            {/* OVERVIEW */}
            <TabsContent value="overview" className="mt-0">
              {/* Contact Info */}
              <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
                <h3 className="text-xs sm:text-sm font-medium text-muted-foreground">Datos de Contacto</h3>
                <div className="space-y-1.5 sm:space-y-2 rounded-lg border border-border/50 bg-background/50 p-2 sm:p-3">
                  {client.email && (
                    <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                      <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                      <span className="text-foreground truncate">{client.email}</span>
                    </div>
                  )}
                  {client.phone && (
                    <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm">
                      <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground shrink-0" />
                      <span className="text-foreground">{client.phone}</span>
                    </div>
                  )}
                  {!client.email && !client.phone && (
                    <p className="text-xs sm:text-sm text-muted-foreground">Sin datos de contacto</p>
                  )}
                </div>
              </div>

              {/* Attribution Info */}
              {(client.acquisition_source || client.utm_source || client.utm_campaign) && (
                <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
                  <h3 className="text-xs sm:text-sm font-medium text-muted-foreground">Atribución</h3>
                  <div className="space-y-1.5 sm:space-y-2 rounded-lg border border-border/50 bg-background/50 p-2 sm:p-3">
                    {client.acquisition_source && (
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="text-muted-foreground">Fuente:</span>
                        <Badge variant="outline" className="text-[10px] sm:text-xs">{client.acquisition_source}</Badge>
                      </div>
                    )}
                    {client.utm_source && (
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="text-muted-foreground">UTM:</span>
                        <span className="text-foreground text-[10px] sm:text-xs">{client.utm_source}</span>
                      </div>
                    )}
                    {client.utm_campaign && (
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="text-muted-foreground">Camp:</span>
                        <span className="text-foreground text-[10px] sm:text-xs truncate max-w-[120px]">{client.utm_campaign}</span>
                      </div>
                    )}
                    {client.first_seen_at && (
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="text-muted-foreground">Primera vez:</span>
                        <span className="text-foreground text-[10px] sm:text-xs">
                          {format(new Date(client.first_seen_at), 'd MMM yy', { locale: es })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-6">
                <div className="rounded-lg border border-border/50 bg-background/50 p-2 sm:p-3 text-center">
                  <DollarSign className="h-4 w-4 sm:h-5 sm:w-5 mx-auto text-emerald-400 mb-0.5 sm:mb-1" />
                  <p className={`text-sm sm:text-lg font-bold ${isVip ? 'text-yellow-400' : 'text-foreground'}`}>
                    ${totalSpendUSD.toLocaleString()}
                  </p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">LTV Real</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/50 p-2 sm:p-3 text-center">
                  <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 mx-auto text-primary mb-0.5 sm:mb-1" />
                  <p className="text-sm sm:text-lg font-bold text-foreground">{totalTransactions}</p>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Transacciones</p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 mb-4 sm:mb-6">
                <Button
                  onClick={handleWhatsApp}
                  disabled={!client.phone}
                  className="flex-1 gap-1.5 sm:gap-2 bg-primary hover:bg-primary/90 h-8 sm:h-9 text-xs sm:text-sm"
                  size="sm"
                >
                  <MessageCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                  WhatsApp
                </Button>
                <Button
                  onClick={handlePortalLink}
                  disabled={!client.stripe_customer_id || loadingPortal}
                  variant="outline"
                  className="flex-1 gap-1.5 sm:gap-2 h-8 sm:h-9 text-xs sm:text-sm"
                  size="sm"
                >
                  {loadingPortal ? <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" /> : copiedLink ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <ExternalLink className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                  Portal
                </Button>
              </div>

              {/* Client 360 fetch state */}
              {isLoading360 && (
                <div className="flex items-center justify-center gap-2 py-6 text-xs sm:text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando datos unificados...
                </div>
              )}
              {error360 && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs sm:text-sm text-red-400">
                  Error cargando Client 360: {(error360 as Error).message}
                  <div className="mt-2">
                    <Button size="sm" variant="outline" className="gap-2" onClick={() => refetch360()}>
                      <RefreshCw className="h-4 w-4" />
                      Reintentar
                    </Button>
                  </div>
                </div>
              )}

              {/* Active Subscription Card */}
              {subscriptions && subscriptions.length > 0 && (
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    Suscripciones ({c360?.counts?.subscriptions ?? subscriptions.length})
                  </h3>
                  <div className="space-y-2">
                    {subscriptions.slice(0, 10).map((sub) => (
                      <div key={sub.id} className={`rounded-lg border p-2.5 sm:p-3 ${getSubscriptionStatusColor(sub.status)}`}>
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-xs sm:text-sm">{sub.plan_name || 'Plan sin nombre'}</span>
                          <Badge variant="outline" className={`text-[10px] sm:text-xs ${getSubscriptionStatusColor(sub.status)}`}>
                            {sub.status === 'active' ? 'Activo' :
                             sub.status === 'trialing' ? 'Prueba' :
                             sub.status === 'past_due' ? 'Vencido' :
                             sub.status === 'unpaid' ? 'Sin pagar' : sub.status}
                          </Badge>
                        </div>
                        <div className="mt-2 text-[10px] sm:text-xs text-muted-foreground space-y-1">
                          <div className="flex justify-between">
                            <span>Monto:</span>
                            <span className="text-foreground">${((sub.amount || 0) / 100).toFixed(2)}/{sub.interval || 'mes'}</span>
                          </div>
                          {sub.current_period_end && (
                            <div className="flex justify-between">
                              <span>Renovación:</span>
                              <span className="text-foreground">{format(new Date(sub.current_period_end), 'd MMM yyyy', { locale: es })}</span>
                            </div>
                          )}
                          {sub.trial_end && new Date(sub.trial_end) > new Date() && (
                            <div className="flex justify-between">
                              <span>Fin de prueba:</span>
                              <span className="text-blue-400">{format(new Date(sub.trial_end), 'd MMM yyyy', { locale: es })}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Communication History */}
              {messages && messages.length > 0 && (
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                    <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    Comunicación ({c360?.counts?.messages ?? messages.length})
                  </h3>
                  <div className="space-y-1.5 sm:space-y-2 rounded-lg border border-border/50 bg-background/50 p-2 sm:p-3 max-h-40 overflow-y-auto">
                    {messages.slice(0, 10).map((msg) => (
                      <div key={msg.id} className="flex items-start gap-2 text-[10px] sm:text-xs">
                        <div className={`shrink-0 mt-0.5 ${msg.direction === 'outbound' ? 'text-blue-400' : 'text-emerald-400'}`}>
                          {msg.direction === 'outbound' ? <Send className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center gap-1">
                            <span className="text-muted-foreground capitalize">{msg.channel}</span>
                            <span className="text-muted-foreground shrink-0">
                              {format(new Date(msg.created_at || ''), 'd MMM HH:mm', { locale: es })}
                            </span>
                          </div>
                          <p className="text-foreground truncate">{msg.body?.slice(0, 50)}...</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Pending Invoices */}
              {invoices && invoices.filter(i => i.status === 'open' || i.status === 'draft').length > 0 && (
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-xs sm:text-sm font-medium text-muted-foreground mb-1.5 sm:mb-2 flex items-center gap-1.5 sm:gap-2">
                    <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    Facturas Pendientes
                  </h3>
                  <div className="space-y-1.5 sm:space-y-2">
                    {invoices.filter(i => i.status === 'open' || i.status === 'draft').slice(0, 10).map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between p-1.5 sm:p-2 rounded-lg border border-amber-500/30 bg-amber-500/10">
                        <span className="text-xs sm:text-sm text-amber-400">${(inv.amount_due / 100).toFixed(2)}</span>
                        {inv.hosted_invoice_url && (
                          <Button size="sm" variant="ghost" className="h-5 sm:h-6 gap-0.5 sm:gap-1 text-[10px] sm:text-xs px-1.5 sm:px-2" onClick={() => window.open(inv.hosted_invoice_url!, '_blank')}>
                            Ver <ExternalLink className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator className="my-3 sm:my-4" />

              {/* Timeline */}
              <h3 className="text-xs sm:text-sm font-medium text-muted-foreground mb-2 sm:mb-3 flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Timeline ({timelineItems.length})
              </h3>
              <div className="relative">
                <div className="absolute left-3 sm:left-4 top-2 bottom-2 w-px bg-border/50" />
                <div className="space-y-2 sm:space-y-3">
                  {timelineItems.map((item, idx) => {
                    if (!item) return null;
                    const Icon = item.icon;
                    return (
                      <div key={idx} className="relative pl-8 sm:pl-10">
                        <div className={`absolute left-0 flex h-6 w-6 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-card border border-border ${idx === 0 ? 'ring-2 ring-primary/30' : ''}`}>
                          <Icon className={`h-3 w-3 sm:h-4 sm:w-4 ${item.color}`} />
                        </div>
                        <div className="rounded-lg bg-background/50 border border-border/30 p-1.5 sm:p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`text-[10px] sm:text-sm font-medium capitalize ${item.color} truncate`}>{item.label}</span>
                              {'source' in item && typeof item.source === 'string' && item.source && (
                                <Badge variant="outline" className="text-[8px] sm:text-[10px] px-1">{item.source as string}</Badge>
                              )}
                            </div>
                            <span className="text-[9px] sm:text-xs text-muted-foreground shrink-0">
                              {format(new Date(item.date), 'd MMM HH:mm', { locale: es })}
                            </span>
                          </div>
                          {'amount' in item && typeof item.amount === 'number' && (
                            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">
                              ${item.amount.toFixed(2)} {('currency' in item && typeof item.currency === 'string') ? item.currency.toUpperCase() : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {timelineItems.length === 0 && (
                    <p className="text-xs sm:text-sm text-muted-foreground text-center py-3 sm:py-4">Sin actividad registrada</p>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* FINANCE */}
            <TabsContent value="finance" className="mt-0 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-medium text-muted-foreground">Finanzas Unificadas</h3>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => refetch360()}>
                  <RefreshCw className="h-4 w-4" />
                  Refrescar
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-border/50 bg-background/50 p-2">
                  <p className="text-[10px] sm:text-xs text-muted-foreground">LTV (pagado)</p>
                  <p className="text-sm sm:text-base font-semibold text-foreground">${(ltvPaidCents / 100).toLocaleString()}</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-background/50 p-2">
                  <p className="text-[10px] sm:text-xs text-muted-foreground">Disputas</p>
                  <p className="text-sm sm:text-base font-semibold text-foreground">{c360?.counts?.disputes ?? disputes.length}</p>
                </div>
              </div>

              {transactions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs sm:text-sm font-medium text-muted-foreground">Transacciones ({c360?.counts?.transactions ?? transactions.length})</h4>
                  <div className="space-y-1.5 rounded-lg border border-border/50 bg-background/50 p-2">
                    {transactions.slice(0, 20).map((t) => (
                      <div key={t.id} className="flex items-center justify-between gap-2 text-[10px] sm:text-xs">
                        <div className="min-w-0">
                          <p className="text-foreground truncate">{t.status} {t.source ? `(${t.source})` : ''}</p>
                          <p className="text-muted-foreground truncate">
                            {t.stripe_created_at || t.created_at ? format(new Date(t.stripe_created_at || t.created_at), 'd MMM HH:mm', { locale: es }) : ''}
                          </p>
                        </div>
                        <span className="text-foreground shrink-0">${(((t.amount || 0) as number) / 100).toFixed(2)} {(t.currency || 'usd').toUpperCase()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {invoices.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs sm:text-sm font-medium text-muted-foreground">Facturas ({c360?.counts?.invoices ?? invoices.length})</h4>
                  <div className="space-y-1.5 rounded-lg border border-border/50 bg-background/50 p-2">
                    {invoices.slice(0, 20).map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between gap-2 text-[10px] sm:text-xs">
                        <div className="min-w-0">
                          <p className="text-foreground truncate">{inv.status}</p>
                          <p className="text-muted-foreground truncate">
                            {inv.stripe_created_at || inv.created_at ? format(new Date(inv.stripe_created_at || inv.created_at), 'd MMM HH:mm', { locale: es }) : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-foreground">${(((inv.amount_due || 0) as number) / 100).toFixed(2)}</span>
                          {inv.hosted_invoice_url && (
                            <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => window.open(inv.hosted_invoice_url!, '_blank')}>
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {disputes.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs sm:text-sm font-medium text-muted-foreground">Disputas ({c360?.counts?.disputes ?? disputes.length})</h4>
                  <div className="space-y-1.5 rounded-lg border border-border/50 bg-background/50 p-2">
                    {disputes.slice(0, 20).map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-2 text-[10px] sm:text-xs">
                        <div className="min-w-0">
                          <p className="text-foreground truncate">{d.status}{d.reason ? ` · ${d.reason}` : ''}</p>
                          <p className="text-muted-foreground truncate">
                            {d.created_at_external || d.created_at ? format(new Date(d.created_at_external || d.created_at), 'd MMM HH:mm', { locale: es }) : ''}
                          </p>
                        </div>
                        <span className="text-foreground shrink-0">${(((d.amount || 0) as number) / 100).toFixed(2)} {(d.currency || 'usd').toUpperCase()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {paypalSubscriptions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs sm:text-sm font-medium text-muted-foreground">PayPal Subs ({c360?.counts?.paypal_subscriptions ?? paypalSubscriptions.length})</h4>
                  <div className="space-y-1.5 rounded-lg border border-border/50 bg-background/50 p-2">
                    {paypalSubscriptions.slice(0, 20).map((ps) => (
                      <div key={ps.id} className="flex items-center justify-between gap-2 text-[10px] sm:text-xs">
                        <div className="min-w-0">
                          <p className="text-foreground truncate">{ps.status}{ps.plan_name ? ` · ${ps.plan_name}` : ''}</p>
                          <p className="text-muted-foreground truncate">{ps.payer_email || ps.payer_id || ''}</p>
                        </div>
                        <span className="text-muted-foreground shrink-0">
                          {ps.update_time || ps.create_time || ps.created_at ? format(new Date(ps.update_time || ps.create_time || ps.created_at), 'd MMM', { locale: es }) : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* CHAT */}
            <TabsContent value="chat" className="mt-0 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-medium text-muted-foreground">Chat Unificado</h3>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => refetch360()}>
                  <RefreshCw className="h-4 w-4" />
                  Refrescar
                </Button>
              </div>

              {conversations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs sm:text-sm font-medium text-muted-foreground">Conversaciones ({c360?.counts?.conversations ?? conversations.length})</h4>
                  <div className="space-y-1.5 rounded-lg border border-border/50 bg-background/50 p-2">
                    {conversations.slice(0, 20).map((c) => (
                      <div key={c.id} className="flex items-center justify-between gap-2 text-[10px] sm:text-xs">
                        <div className="min-w-0">
                          <p className="text-foreground truncate">{c.platform} · {c.status} · {c.priority}</p>
                          <p className="text-muted-foreground truncate">{c.contact_id}</p>
                        </div>
                        <span className="text-muted-foreground shrink-0">
                          {c.last_message_at ? format(new Date(c.last_message_at), 'd MMM HH:mm', { locale: es }) : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {chatEvents.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs sm:text-sm font-medium text-muted-foreground">Mensajes ({c360?.counts?.chat_events ?? chatEvents.length})</h4>
                  <div className="space-y-1.5 rounded-lg border border-border/50 bg-background/50 p-2 max-h-72 overflow-y-auto">
                    {chatEvents.slice(0, 50).map((e) => (
                      <div key={e.id} className="text-[10px] sm:text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground truncate">{e.platform} · {e.sender}</span>
                          <span className="text-muted-foreground shrink-0">
                            {e.created_at ? format(new Date(e.created_at), 'd MMM HH:mm', { locale: es }) : ''}
                          </span>
                        </div>
                        {e.message && <p className="text-foreground break-words">{e.message}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {scheduledMessages.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs sm:text-sm font-medium text-muted-foreground">Programados ({c360?.counts?.scheduled_messages ?? scheduledMessages.length})</h4>
                  <div className="space-y-1.5 rounded-lg border border-border/50 bg-background/50 p-2">
                    {scheduledMessages.slice(0, 20).map((sm) => (
                      <div key={sm.id} className="flex items-center justify-between gap-2 text-[10px] sm:text-xs">
                        <div className="min-w-0">
                          <p className="text-foreground truncate">{sm.status}</p>
                          <p className="text-muted-foreground truncate">{sm.message?.slice(0, 60) || ''}</p>
                        </div>
                        <span className="text-muted-foreground shrink-0">
                          {sm.scheduled_at ? format(new Date(sm.scheduled_at), 'd MMM HH:mm', { locale: es }) : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* OPS */}
            <TabsContent value="ops" className="mt-0 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-medium text-muted-foreground">Ops</h3>
                <Button size="sm" variant="outline" className="gap-2" onClick={() => refetch360()}>
                  <RefreshCw className="h-4 w-4" />
                  Refrescar
                </Button>
              </div>

              {mergeConflicts.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs sm:text-sm font-medium text-muted-foreground">Conflictos ({c360?.counts?.merge_conflicts ?? mergeConflicts.length})</h4>
                  <div className="space-y-1.5 rounded-lg border border-border/50 bg-background/50 p-2">
                    {mergeConflicts.slice(0, 20).map((mc) => (
                      <div key={mc.id} className="flex items-center justify-between gap-2 text-[10px] sm:text-xs">
                        <div className="min-w-0">
                          <p className="text-foreground truncate">{mc.status} · {mc.conflict_type}</p>
                          <p className="text-muted-foreground truncate">{mc.source}:{mc.external_id}</p>
                        </div>
                        <span className="text-muted-foreground shrink-0">
                          {mc.created_at ? format(new Date(mc.created_at), 'd MMM', { locale: es }) : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {flowExecutions.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs sm:text-sm font-medium text-muted-foreground">Flows ({c360?.counts?.flow_executions ?? flowExecutions.length})</h4>
                  <div className="space-y-1.5 rounded-lg border border-border/50 bg-background/50 p-2">
                    {flowExecutions.slice(0, 20).map((fe) => (
                      <div key={fe.id} className="flex items-center justify-between gap-2 text-[10px] sm:text-xs">
                        <div className="min-w-0">
                          <p className="text-foreground truncate">{fe.status || 'unknown'} · {fe.trigger_event}</p>
                          {fe.error_message && <p className="text-red-400 truncate">{fe.error_message}</p>}
                        </div>
                        <span className="text-muted-foreground shrink-0">
                          {fe.started_at ? format(new Date(fe.started_at), 'd MMM HH:mm', { locale: es }) : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* JSON */}
            <TabsContent value="json" className="mt-0 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-medium text-muted-foreground">Client 360 JSON</h3>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!client360}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(JSON.stringify(client360, null, 2));
                        toast({ title: 'JSON copiado' });
                      } catch {
                        toast({ title: 'No se pudo copiar JSON', variant: 'destructive' });
                      }
                    }}
                  >
                    Copiar
                  </Button>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => refetch360()}>
                    <RefreshCw className="h-4 w-4" />
                    Refrescar
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border border-border/50 bg-background/50 p-2">
                <pre className="text-[10px] sm:text-xs whitespace-pre-wrap break-words max-h-[70vh] overflow-y-auto">
                  {client360 ? JSON.stringify(client360, null, 2) : 'Sin datos'}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
