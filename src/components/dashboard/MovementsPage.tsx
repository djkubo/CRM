import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Activity, 
  AlertCircle, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Search,
  RefreshCw,
  Wallet,
  CreditCard,
  Globe,
  Filter,
  TrendingUp,
  TrendingDown,
  Ban,
  Copy,
  Check
} from "lucide-react";

interface Movement {
  id: string;
  stripe_payment_intent_id: string;
  payment_key: string | null;
  payment_type: string | null;
  amount: number;
  currency: string | null;
  status: string;
  failure_code: string | null;
  failure_message: string | null;
  customer_email: string | null;
  stripe_created_at: string | null;
  source: string | null;
  external_transaction_id: string | null;
  subscription_id: string | null;
  metadata: {
    card_last4?: string;
    card_brand?: string;
    customer_name?: string;
    product_name?: string;
    invoice_number?: string;
    decline_reason_es?: string;
    fee_amount?: number;
    net_amount?: number;
    gross_amount?: number;
    paypal_payer_id?: string;
    event_description?: string;
    [key: string]: any;
  } | null;
}

const formatAmount = (amount: number, currency: string | null) => {
  const curr = currency?.toUpperCase() || "USD";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: curr,
    minimumFractionDigits: 2,
  }).format(amount / 100);
};

const getStatusConfig = (status: string) => {
  const configs: Record<string, { label: string; icon: typeof CheckCircle2; className: string }> = {
    succeeded: { 
      label: "Exitoso", 
      icon: CheckCircle2,
      className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
    },
    paid: { 
      label: "Completado", 
      icon: CheckCircle2,
      className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" 
    },
    failed: { 
      label: "Erróneo", 
      icon: XCircle,
      className: "bg-destructive/10 text-destructive border-destructive/20" 
    },
    requires_payment_method: { 
      label: "Bloqueado", 
      icon: Ban,
      className: "bg-amber-500/10 text-amber-500 border-amber-500/20" 
    },
    requires_action: { 
      label: "En trámite", 
      icon: Clock,
      className: "bg-orange-500/10 text-orange-500 border-orange-500/20" 
    },
    canceled: { 
      label: "Cancelado", 
      icon: XCircle,
      className: "bg-destructive/10 text-destructive border-destructive/20" 
    },
    refunded: { 
      label: "Reembolsado", 
      icon: TrendingDown,
      className: "bg-purple-500/10 text-purple-500 border-purple-500/20" 
    },
    pending: { 
      label: "Pendiente", 
      icon: Clock,
      className: "bg-blue-500/10 text-blue-500 border-blue-500/20" 
    },
  };

  return configs[status] || { 
    label: status, 
    icon: AlertCircle,
    className: "bg-muted text-muted-foreground" 
  };
};

const getSourceConfig = (source: string | null) => {
  const configs: Record<string, { label: string; icon: typeof CreditCard; className: string }> = {
    stripe: { 
      label: "Stripe", 
      icon: CreditCard,
      className: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" 
    },
    paypal: { 
      label: "PayPal", 
      icon: Wallet,
      className: "bg-blue-500/10 text-blue-400 border-blue-500/20" 
    },
    web: { 
      label: "Web", 
      icon: Globe,
      className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
    },
  };

  return configs[source || 'stripe'] || configs.stripe;
};

// Get description based on metadata and source
const getDescription = (m: Movement): string => {
  // If we have invoice_number, show it
  if (m.metadata?.invoice_number) {
    return `Invoice ${m.metadata.invoice_number}`;
  }
  // PayPal event description
  if (m.metadata?.event_description) {
    return m.metadata.event_description;
  }
  // Product name as fallback
  if (m.metadata?.product_name) {
    return m.metadata.product_name;
  }
  return "—";
};

// Get decline reason in Spanish
const getDeclineReason = (m: Movement): string | null => {
  if (m.metadata?.decline_reason_es) {
    return m.metadata.decline_reason_es;
  }
  
  // Map common failure messages to Spanish
  const failureMap: Record<string, string> = {
    'insufficient_funds': 'Fondos insuficientes',
    'Your card has insufficient funds.': 'Fondos insuficientes',
    'card_declined': 'Tarjeta rechazada',
    'generic_decline': 'Rechazo genérico',
    'do_not_honor': 'No aceptar',
    'lost_card': 'Tarjeta perdida',
    'stolen_card': 'Tarjeta robada',
    'expired_card': 'Tarjeta expirada',
    'incorrect_cvc': 'CVC incorrecto',
    'processing_error': 'Error de procesamiento',
    'incorrect_number': 'Número incorrecto',
  };
  
  if (m.failure_message && failureMap[m.failure_message]) {
    return failureMap[m.failure_message];
  }
  if (m.failure_code && failureMap[m.failure_code]) {
    return failureMap[m.failure_code];
  }
  
  // Try to match partial strings
  if (m.failure_message?.toLowerCase().includes('insufficient')) {
    return 'Fondos insuficientes';
  }
  if (m.failure_message?.toLowerCase().includes('declined')) {
    return 'Tarjeta rechazada';
  }
  
  return m.failure_message || m.failure_code || null;
};

// Get payment method display
const getPaymentMethod = (m: Movement): { display: string; brand?: string } => {
  if (m.source === 'paypal') {
    return { display: 'PayPal', brand: 'paypal' };
  }
  if (m.metadata?.card_last4) {
    const brand = m.metadata.card_brand?.toLowerCase() || '';
    return { 
      display: `•••• ${m.metadata.card_last4}`,
      brand 
    };
  }
  return { display: '—' };
};

// Card brand icon/color
const getCardBrandStyle = (brand?: string) => {
  const styles: Record<string, string> = {
    visa: 'text-blue-500',
    mastercard: 'text-orange-500',
    amex: 'text-blue-400',
    discover: 'text-orange-400',
    paypal: 'text-blue-500',
  };
  return styles[brand || ''] || 'text-muted-foreground';
};

export function MovementsPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchMovements = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("stripe_created_at", { ascending: false })
      .limit(500);

    if (!error && data) {
      setMovements(data as Movement[]);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchMovements();

    // Real-time subscription
    const channel = supabase
      .channel('movements-realtime')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'transactions' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMovements(prev => [payload.new as Movement, ...prev.slice(0, 499)]);
          } else if (payload.eventType === 'UPDATE') {
            setMovements(prev => prev.map(m => 
              m.id === (payload.new as Movement).id ? payload.new as Movement : m
            ));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchMovements();
    setIsRefreshing(false);
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered movements
  const filteredMovements = useMemo(() => {
    return movements.filter(m => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesEmail = m.customer_email?.toLowerCase().includes(query);
        const matchesId = m.stripe_payment_intent_id?.toLowerCase().includes(query);
        const matchesExtId = m.external_transaction_id?.toLowerCase().includes(query);
        const matchesName = m.metadata?.customer_name?.toLowerCase().includes(query);
        if (!matchesEmail && !matchesId && !matchesExtId && !matchesName) return false;
      }
      
      // Source filter
      if (sourceFilter !== "all" && m.source !== sourceFilter) return false;
      
      // Status filter
      if (statusFilter !== "all") {
        if (statusFilter === "success" && !['succeeded', 'paid'].includes(m.status)) return false;
        if (statusFilter === "failed" && !['failed', 'requires_payment_method', 'canceled'].includes(m.status)) return false;
        if (statusFilter === "pending" && !['pending', 'requires_action'].includes(m.status)) return false;
      }
      
      return true;
    });
  }, [movements, searchQuery, sourceFilter, statusFilter]);

  // Stats
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayMovements = movements.filter(m => {
      if (!m.stripe_created_at) return false;
      return new Date(m.stripe_created_at) >= today;
    });

    const successToday = todayMovements.filter(m => ['succeeded', 'paid'].includes(m.status));
    const failedToday = todayMovements.filter(m => ['failed', 'requires_payment_method', 'canceled'].includes(m.status));
    
    const totalSuccess = successToday.reduce((sum, m) => sum + m.amount, 0);
    const totalFailed = failedToday.reduce((sum, m) => sum + m.amount, 0);
    
    const bySource = {
      stripe: movements.filter(m => m.source === 'stripe' || !m.source).length,
      paypal: movements.filter(m => m.source === 'paypal').length,
      web: movements.filter(m => m.source === 'web').length,
    };

    console.log('📊 Movement stats by source:', bySource, 'Total:', movements.length);

    return {
      todayCount: todayMovements.length,
      successCount: successToday.length,
      failedCount: failedToday.length,
      totalSuccess,
      totalFailed,
      bySource,
    };
  }, [movements]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-3">
            <Activity className="h-7 w-7 md:h-8 md:w-8 text-primary" />
            Movimientos en Tiempo Real
          </h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Centralización de todas las transacciones: Stripe, PayPal y Web
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
          Actualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 md:gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <Activity className="h-4 w-4" />
            Hoy
          </div>
          <p className="text-2xl font-bold text-foreground">{stats.todayCount}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 text-emerald-400 text-xs mb-2">
            <TrendingUp className="h-4 w-4" />
            Exitosos
          </div>
          <p className="text-2xl font-bold text-emerald-400">{stats.successCount}</p>
          <p className="text-xs text-emerald-400/70">{formatAmount(stats.totalSuccess, 'usd')}</p>
        </div>
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 text-destructive text-xs mb-2">
            <XCircle className="h-4 w-4" />
            Fallidos
          </div>
          <p className="text-2xl font-bold text-destructive">{stats.failedCount}</p>
          <p className="text-xs text-destructive/70">{formatAmount(stats.totalFailed, 'usd')}</p>
        </div>
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
          <div className="flex items-center gap-2 text-indigo-400 text-xs mb-2">
            <CreditCard className="h-4 w-4" />
            Stripe
          </div>
          <p className="text-2xl font-bold text-indigo-400">{stats.bySource.stripe}</p>
        </div>
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="flex items-center gap-2 text-blue-400 text-xs mb-2">
            <Wallet className="h-4 w-4" />
            PayPal
          </div>
          <p className="text-2xl font-bold text-blue-400">{stats.bySource.paypal}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 text-emerald-400 text-xs mb-2">
            <Globe className="h-4 w-4" />
            Web
          </div>
          <p className="text-2xl font-bold text-emerald-400">{stats.bySource.web}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por email, nombre o ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-full md:w-40">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Fuente" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="stripe">Stripe</SelectItem>
            <SelectItem value="paypal">PayPal</SelectItem>
            <SelectItem value="web">Web</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full md:w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="success">Exitosos</SelectItem>
            <SelectItem value="failed">Fallidos</SelectItem>
            <SelectItem value="pending">Pendientes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Mostrando {filteredMovements.length} de {movements.length} movimientos
      </div>

      {/* Movements Table - Enhanced */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Importe
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Método
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Descripción
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Cliente
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Fecha
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Producto
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Estado
                </th>
                <th className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Motivo rechazo
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredMovements.map((m) => {
                const statusConfig = getStatusConfig(m.status);
                const sourceConfig = getSourceConfig(m.source);
                const StatusIcon = statusConfig.icon;
                const paymentMethod = getPaymentMethod(m);
                const declineReason = getDeclineReason(m);
                const description = getDescription(m);
                
                return (
                  <tr key={m.id} className="transition-colors hover:bg-muted/20">
                    {/* Amount + Currency */}
                    <td className="px-3 py-3">
                      <div className="flex flex-col">
                        <span className={cn(
                          "font-semibold text-sm",
                          ['succeeded', 'paid'].includes(m.status) ? "text-emerald-400" : 
                          ['failed', 'requires_payment_method', 'canceled'].includes(m.status) ? "text-destructive" :
                          "text-foreground"
                        )}>
                          {formatAmount(m.amount, m.currency)}
                        </span>
                        <span className="text-[10px] text-muted-foreground uppercase">
                          {m.currency || 'USD'}
                        </span>
                        {/* Net amount for PayPal */}
                        {m.metadata?.net_amount && m.metadata?.fee_amount && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-[10px] text-muted-foreground/70 cursor-help">
                                  Neto: {formatAmount(m.metadata.net_amount, m.currency)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <div className="text-xs space-y-1">
                                  <p>Bruto: {formatAmount(m.metadata.gross_amount || m.amount, m.currency)}</p>
                                  <p>Comisión: {formatAmount(m.metadata.fee_amount, m.currency)}</p>
                                  <p>Neto: {formatAmount(m.metadata.net_amount, m.currency)}</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </td>
                    
                    {/* Payment Method */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {m.source === 'paypal' ? (
                          <Wallet className="h-4 w-4 text-blue-500" />
                        ) : (
                          <CreditCard className={cn("h-4 w-4", getCardBrandStyle(paymentMethod.brand))} />
                        )}
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground">
                            {paymentMethod.display}
                          </span>
                          {paymentMethod.brand && paymentMethod.brand !== 'paypal' && (
                            <span className="text-[10px] text-muted-foreground capitalize">
                              {paymentMethod.brand}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    
                    {/* Description */}
                    <td className="px-3 py-3">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-1.5 max-w-[140px] cursor-help">
                              <span className="text-sm text-foreground truncate">
                                {description}
                              </span>
                              {m.external_transaction_id && (
                                <button
                                  onClick={() => handleCopyId(m.external_transaction_id!)}
                                  className="p-0.5 hover:bg-muted rounded opacity-60 hover:opacity-100 transition-opacity"
                                >
                                  {copiedId === m.external_transaction_id ? (
                                    <Check className="h-3 w-3 text-emerald-500" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </button>
                              )}
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <div className="text-xs space-y-1">
                              <p className="font-semibold">{description}</p>
                              {m.external_transaction_id && (
                                <p className="font-mono text-muted-foreground">{m.external_transaction_id}</p>
                              )}
                              <p className="font-mono text-muted-foreground/70">{m.stripe_payment_intent_id}</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                    
                    {/* Customer */}
                    <td className="px-3 py-3">
                      <div className="max-w-[180px]">
                        {m.metadata?.customer_name && (
                          <span className="text-sm font-medium text-foreground truncate block">
                            {m.metadata.customer_name}
                          </span>
                        )}
                        {m.customer_email ? (
                          <span className={cn(
                            "text-xs truncate block",
                            m.metadata?.customer_name ? "text-muted-foreground" : "text-foreground"
                          )}>
                            {m.customer_email}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">Sin email</span>
                        )}
                      </div>
                    </td>
                    
                    {/* Date */}
                    <td className="px-3 py-3">
                      {m.stripe_created_at ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex flex-col cursor-help">
                                <span className="text-sm text-foreground whitespace-nowrap">
                                  {format(new Date(m.stripe_created_at), "d MMM", { locale: es })}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  {format(new Date(m.stripe_created_at), "HH:mm", { locale: es })}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{format(new Date(m.stripe_created_at), "PPpp", { locale: es })}</p>
                              <p className="text-muted-foreground">
                                {formatDistanceToNow(new Date(m.stripe_created_at), { addSuffix: true, locale: es })}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    
                    {/* Product */}
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("text-[10px] border", sourceConfig.className)}>
                          {sourceConfig.label}
                        </Badge>
                        {m.metadata?.product_name && m.metadata.product_name !== description && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs text-muted-foreground truncate max-w-[80px] cursor-help">
                                  {m.metadata.product_name}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {m.metadata.product_name}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                    </td>
                    
                    {/* Status */}
                    <td className="px-3 py-3">
                      <Badge variant="outline" className={cn("text-[10px] border gap-1", statusConfig.className)}>
                        <StatusIcon className="h-3 w-3" />
                        {statusConfig.label}
                      </Badge>
                    </td>
                    
                    {/* Decline Reason */}
                    <td className="px-3 py-3">
                      {declineReason ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-1.5 cursor-help max-w-[120px]">
                                <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                                <span className="text-xs text-destructive truncate">
                                  {declineReason}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="font-semibold text-destructive">{declineReason}</p>
                              {m.failure_code && <p className="text-xs font-mono">{m.failure_code}</p>}
                              {m.failure_message && m.failure_message !== declineReason && (
                                <p className="text-xs text-muted-foreground">{m.failure_message}</p>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {filteredMovements.length === 0 && (
          <div className="p-8 text-center">
            <Activity className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-4 text-muted-foreground">No se encontraron movimientos</p>
          </div>
        )}
      </div>
    </div>
  );
}
