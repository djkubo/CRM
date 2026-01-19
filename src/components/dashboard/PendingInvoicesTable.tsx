import { ExternalLink, RefreshCw, FileText, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import type { Invoice } from "@/hooks/useInvoices";

interface PendingInvoicesTableProps {
  invoices: Invoice[];
  isLoading: boolean;
  onSync: () => void;
  isSyncing: boolean;
}

export function PendingInvoicesTable({
  invoices,
  isLoading,
  onSync,
  isSyncing,
}: PendingInvoicesTableProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "draft":
        return <Badge variant="outline" className="border-yellow-500/50 text-yellow-400">Borrador</Badge>;
      case "open":
        return <Badge variant="outline" className="border-amber-500/50 text-amber-400">Abierta</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatScheduledDate = (dateStr: string | null) => {
    if (!dateStr) return "Sin programar";
    const date = new Date(dateStr);
    const relative = formatDistanceToNow(date, { addSuffix: true, locale: es });
    const absolute = format(date, "dd MMM, HH:mm", { locale: es });
    return (
      <div className="flex flex-col">
        <span className="text-amber-300">{relative}</span>
        <span className="text-xs text-muted-foreground">{absolute}</span>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-amber-500/20 bg-[#1a1f36] p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/20">
            <FileText className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Cobros Pendientes</h2>
            <p className="text-sm text-muted-foreground">
              Facturas esperando cobro automático de Stripe
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onSync}
          disabled={isSyncing}
          className="gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
        >
          <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
          Sincronizar
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-amber-500/5" />
          ))}
        </div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Clock className="h-12 w-12 text-amber-500/30 mb-3" />
          <p className="text-muted-foreground">No hay facturas pendientes</p>
          <p className="text-sm text-muted-foreground/70">
            Las facturas en draft/open aparecerán aquí
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-amber-500/10">
              <TableHead className="text-amber-300/80">Cliente</TableHead>
              <TableHead className="text-amber-300/80">Monto</TableHead>
              <TableHead className="text-amber-300/80">Estado</TableHead>
              <TableHead className="text-amber-300/80">Cobro Programado</TableHead>
              <TableHead className="text-amber-300/80 text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((invoice) => (
              <TableRow 
                key={invoice.id} 
                className="hover:bg-amber-500/5 border-amber-500/10"
              >
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-white">
                      {invoice.customer_email || "Sin email"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {invoice.stripe_invoice_id.slice(0, 20)}...
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-lg font-semibold text-amber-300">
                    ${(invoice.amount_due / 100).toFixed(2)}
                  </span>
                  <span className="text-xs text-muted-foreground ml-1">
                    {invoice.currency?.toUpperCase()}
                  </span>
                </TableCell>
                <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                <TableCell>
                  {formatScheduledDate(invoice.next_payment_attempt)}
                </TableCell>
                <TableCell className="text-right">
                  {invoice.hosted_invoice_url ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                      className="gap-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                    >
                      <a
                        href={invoice.hosted_invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Ver en Stripe
                      </a>
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Sin link
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {invoices.length > 0 && (
        <div className="mt-4 pt-4 border-t border-amber-500/10 flex justify-between items-center">
          <span className="text-sm text-muted-foreground">
            {invoices.length} {invoices.length === 1 ? "factura" : "facturas"} pendientes
          </span>
          <span className="text-lg font-bold text-amber-300">
            Total: ${(invoices.reduce((sum, inv) => sum + inv.amount_due, 0) / 100).toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}
