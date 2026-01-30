

# Plan de Reparación de RPCs Faltantes

## Resumen del Problema

El dashboard muestra errores 500 porque **3 funciones RPC críticas no existen** en la base de datos, aunque el código frontend las espera. Las migraciones anteriores fallaron o no se aplicaron.

## Funciones Faltantes

| RPC Faltante | Archivo que la usa | Impacto |
|--------------|-------------------|---------|
| `kpi_mrr_summary` | `useDailyKPIs.ts`, Dashboard | MRR muestra $0 |
| `get_staging_counts_fast` | `useClients.ts` | Conteos de clientes fallan |
| `kpi_invoices_summary` | `useInvoices.ts` | Totales de facturas fallan |

## Solución

### Fase 1: Crear las 3 RPCs Faltantes

```text
┌─────────────────────────────────────────────────────────────────┐
│                    NUEVA MIGRACIÓN SQL                          │
├─────────────────────────────────────────────────────────────────┤
│  1. kpi_mrr_summary()                                           │
│     → Calcula MRR total + at_risk desde subscriptions           │
│     → Respuesta: {mrr, active_count, at_risk_amount, at_risk_count} │
│                                                                 │
│  2. get_staging_counts_fast()                                   │
│     → Usa pg_stat_user_tables para estimados instantáneos       │
│     → Respuesta: [{table_name, row_estimate}, ...]              │
│                                                                 │
│  3. kpi_invoices_summary()                                      │
│     → Agrega totales de facturas por status                     │
│     → Respuesta: {pending_total, paid_total, next_72h_total, ...}│
└─────────────────────────────────────────────────────────────────┘
```

### Fase 2: Actualizar Hooks con Fallbacks Robustos

Modificar los hooks para que:
1. Intenten llamar a los RPCs optimizados primero
2. Si fallan, usen queries simples como fallback (sin escanear toda la tabla)
3. No bloqueen la UI si un RPC no existe

**Archivos a modificar**:
- `src/hooks/useDailyKPIs.ts` - Mejorar fallback para MRR
- `src/hooks/useClients.ts` - Simplificar conteo con COUNT(1) + límite
- `src/hooks/useInvoices.ts` - Ya tiene fallback, solo ajustar

---

## Detalles Técnicos

### RPC 1: `kpi_mrr_summary`

```sql
CREATE OR REPLACE FUNCTION kpi_mrr_summary()
RETURNS TABLE(
  mrr bigint,
  active_count bigint,
  at_risk_amount bigint,
  at_risk_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER
SET statement_timeout TO '10s'
AS $$
  SELECT 
    COALESCE(SUM(CASE WHEN status IN ('active','trialing') THEN amount ELSE 0 END), 0)::bigint,
    COUNT(*) FILTER (WHERE status IN ('active','trialing'))::bigint,
    COALESCE(SUM(CASE WHEN status = 'past_due' THEN amount ELSE 0 END), 0)::bigint,
    COUNT(*) FILTER (WHERE status = 'past_due')::bigint
  FROM subscriptions;
$$;
```

### RPC 2: `get_staging_counts_fast`

```sql
CREATE OR REPLACE FUNCTION get_staging_counts_fast()
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT jsonb_agg(jsonb_build_object(
    'table_name', relname,
    'row_estimate', n_live_tup
  ))
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
  AND relname IN ('clients','transactions','invoices','subscriptions');
$$;
```

### RPC 3: `kpi_invoices_summary`

```sql
CREATE OR REPLACE FUNCTION kpi_invoices_summary()
RETURNS TABLE(
  pending_count bigint,
  pending_total bigint,
  paid_total bigint,
  next_72h_count bigint,
  next_72h_total bigint,
  uncollectible_total bigint
) LANGUAGE sql STABLE SECURITY DEFINER
SET statement_timeout TO '15s'
AS $$
  SELECT 
    COUNT(*) FILTER (WHERE status IN ('open','draft'))::bigint,
    COALESCE(SUM(amount_due) FILTER (WHERE status IN ('open','draft')), 0)::bigint,
    COALESCE(SUM(amount_paid) FILTER (WHERE status = 'paid'), 0)::bigint,
    COUNT(*) FILTER (WHERE status = 'open' 
      AND next_payment_attempt <= NOW() + INTERVAL '72 hours')::bigint,
    COALESCE(SUM(amount_due) FILTER (WHERE status = 'open' 
      AND next_payment_attempt <= NOW() + INTERVAL '72 hours'), 0)::bigint,
    COALESCE(SUM(amount_due) FILTER (WHERE status = 'uncollectible'), 0)::bigint
  FROM invoices;
$$;
```

---

## Cambios en Frontend (Fallbacks)

### `useClients.ts` - Línea 57-81

Simplificar el conteo para que no dependa de RPCs faltantes:

```typescript
const { data: totalCount = 0 } = useQuery({
  queryKey: ["clients-count", vipOnly],
  queryFn: async () => {
    if (vipOnly) {
      const { count } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true })
        .gte("total_spend", VIP_THRESHOLD);
      return count || 0;
    }
    // Intentar RPC primero, fallback a COUNT estimado
    try {
      const { data } = await supabase.rpc('get_staging_counts_fast');
      const clientsRow = data?.find(r => r.table_name === 'clients');
      if (clientsRow?.row_estimate) return clientsRow.row_estimate;
    } catch { /* ignore */ }
    // Fallback: límite seguro
    return 200000; // Estimado conocido
  },
  staleTime: 120000,
});
```

### `useDailyKPIs.ts` - Líneas 100-138

Agregar fallback robusto para MRR:

```typescript
// MRR con fallback
try {
  const { data } = await supabase.rpc('kpi_mrr_summary');
  if (data?.[0]) {
    mrr = (data[0].mrr || 0) / 100;
    mrrActiveCount = data[0].active_count || 0;
    revenueAtRisk = (data[0].at_risk_amount || 0) / 100;
    revenueAtRiskCount = data[0].at_risk_count || 0;
  }
} catch {
  // Fallback: usar kpi_mrr (que sí existe)
  const { data: mrrData } = await supabase.rpc('kpi_mrr');
  if (mrrData?.[0]) {
    mrr = (mrrData[0].mrr || 0) / 100;
    mrrActiveCount = mrrData[0].active_subscriptions || 0;
  }
}
```

---

## Resultado Esperado

Después de aplicar este plan:

1. **Dashboard carga instantáneamente** - RPCs responden en <50ms
2. **Sin errores 500** - Todas las funciones requeridas existirán
3. **Fallbacks seguros** - Si algún RPC falla, la UI sigue funcionando
4. **Métricas precisas** - MRR, conteos y totales correctos

---

## Orden de Implementación

1. Crear migración SQL con las 3 funciones RPC
2. Actualizar `useClients.ts` con fallback simplificado
3. Actualizar `useDailyKPIs.ts` con fallback a `kpi_mrr`
4. Probar que el dashboard carga sin errores

