

# Plan de Emergencia: Optimización de Base de Datos para Eliminar Timeouts

## Problema Identificado

La base de datos está sufriendo **cascadas de statement timeouts** porque:

1. **221k clientes** - Las queries con `{ count: "exact" }` fuerzan full table scans
2. **No hay índice en `subscriptions.amount`** - La query `ORDER BY amount DESC` es lenta
3. **No hay índice en `invoices.client_id`** - Los JOINs son lentos
4. **Los hooks del Dashboard cargan TODO** - Sin paginación server-side

---

## Acciones Inmediatas

### 1. Crear Índices Faltantes (Migración SQL)

```sql
-- Índice para ORDER BY amount DESC en subscriptions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_amount_desc 
ON subscriptions (amount DESC);

-- Índice para JOINs de invoices con clients
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_client_id 
ON invoices (client_id);

-- Índice compuesto para invoices por status y fecha
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_status_created 
ON invoices (status, stripe_created_at DESC);

-- Índice para transactions por status (para kpi_failed_payments)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_status_created 
ON transactions (status, stripe_created_at DESC);

-- Índice parcial para transactions fallidas (optimiza kpi_failed_payments)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_failed 
ON transactions (stripe_created_at DESC, amount, currency, customer_email)
WHERE status = 'failed' OR failure_code IS NOT NULL;
```

### 2. Optimizar Hooks que Causan Timeouts

**Archivo: `src/hooks/useSubscriptions.ts`**

El hook actual descarga las 5000 suscripciones con `ORDER BY amount DESC`. Solo necesitamos:
- Agregar `{ count: "exact", head: true }` para el conteo sin descargar datos
- Reducir el `.limit(5000)` a `.limit(100)` con paginación

**Archivo: `src/hooks/useDailyKPIs.ts`**

Líneas 122-129 descargan **TODOS** los registros de `subscriptions` y `invoices`:

```typescript
// PROBLEMA: Descarga TODAS las suscripciones activas
supabase.from('subscriptions')
  .select('amount')
  .eq('status', 'active'),  // Sin limit = 221k rows potenciales

// PROBLEMA: Descarga TODAS las invoices abiertas
supabase.from('invoices')
  .select('amount_due')
  .in('status', ['open', 'past_due']),  // Sin limit
```

**Solución**: Usar agregación server-side con RPCs en lugar de descargar todo al cliente.

### 3. Crear RPC Optimizado para MRR y Revenue at Risk

```sql
CREATE OR REPLACE FUNCTION kpi_mrr_summary()
RETURNS TABLE(mrr bigint, active_count bigint, at_risk_amount bigint, at_risk_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET statement_timeout TO '10s'
AS $$
  SELECT 
    COALESCE(SUM(amount) FILTER (WHERE status = 'active'), 0)::bigint AS mrr,
    COUNT(*) FILTER (WHERE status = 'active')::bigint AS active_count,
    COALESCE(SUM(amount) FILTER (WHERE status IN ('past_due', 'unpaid')), 0)::bigint AS at_risk_amount,
    COUNT(*) FILTER (WHERE status IN ('past_due', 'unpaid'))::bigint AS at_risk_count
  FROM subscriptions;
$$;
```

### 4. Actualizar useDailyKPIs para Usar RPCs

Reemplazar las queries directas por el nuevo RPC:

```typescript
// ANTES (líneas 122-129)
supabase.from('subscriptions').select('amount').eq('status', 'active'),
supabase.from('invoices').select('amount_due').in('status', ['open', 'past_due']),

// DESPUÉS
supabase.rpc('kpi_mrr_summary'),
```

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| Migración SQL | Crear 5 índices nuevos |
| `src/hooks/useDailyKPIs.ts` | Usar RPC en lugar de queries directas |
| `src/hooks/useSubscriptions.ts` | Reducir límite a 100 + paginación |
| Nueva función SQL | `kpi_mrr_summary()` para agregación |

---

## Impacto Esperado

| Métrica | Antes | Después |
|---------|-------|---------|
| Query `subscriptions ORDER BY amount` | 8-15s (timeout) | <100ms |
| Query `invoices JOIN clients` | 5-10s (timeout) | <200ms |
| `kpi_failed_payments` | 10-30s (timeout) | <500ms |
| Dashboard load time | Infinito (crash) | <2 segundos |

---

## Sobre el Bot de Render

El error CORS del bot en `vrp-bot-1.onrender.com` es un servicio externo que no puedo modificar desde aquí. Opciones:

1. **Keep-alive automático**: Configurar un cron job que haga ping al bot cada 5 minutos
2. **Upgrade del plan**: El free tier de Render duerme después de 15 minutos de inactividad
3. **Mover a Edge Function**: Si el bot solo hace llamadas a APIs, podría migrarse a una Edge Function que no duerme

---

## Orden de Ejecución

1. **PRIMERO**: Aplicar migración SQL con índices (efecto inmediato)
2. **SEGUNDO**: Crear RPC `kpi_mrr_summary`
3. **TERCERO**: Actualizar `useDailyKPIs.ts` para usar el RPC
4. **CUARTO**: Optimizar `useSubscriptions.ts` con paginación

