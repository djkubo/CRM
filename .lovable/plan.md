
# Plan de Emergencia: Detener Queries Pesadas en useMetrics.ts

## Problema Crítico Identificado

El archivo `useMetrics.ts` ejecuta **5 queries COUNT paralelas** contra la tabla `clients` (221k+ registros):

```typescript
// Líneas ~47-71 - CAUSANDO 503 TIMEOUTS
const [leadsResult, trialsResult, customersResult, ...] = await Promise.all([
  supabase.from('clients').select('*', { count: 'exact', head: true }).eq('lifecycle_stage', 'LEAD'),
  supabase.from('clients').select('*', { count: 'exact', head: true }).eq('lifecycle_stage', 'TRIAL'),
  supabase.from('clients').select('*', { count: 'exact', head: true }).eq('lifecycle_stage', 'CUSTOMER'),
  supabase.from('clients').select('*', { count: 'exact', head: true }).eq('lifecycle_stage', 'CHURN'),
  supabase.from('clients').select('*', { count: 'exact', head: true }).eq('lifecycle_stage', 'AT_RISK'),
]);
```

## Solución Inmediata

Reemplazar las 5 queries por UNA sola llamada al RPC `dashboard_metrics` que **YA EXISTE** en la base de datos.

## Cambio Exacto en useMetrics.ts

**ELIMINAR** (líneas ~47-71):
- Las 5 llamadas paralelas a `supabase.from('clients')`

**REEMPLAZAR CON**:
```typescript
const { data: dashboardData } = await supabase.rpc('dashboard_metrics');
const metrics = dashboardData?.[0] || {};

// Extraer conteos del RPC
const leadsCount = metrics.leads_count || 0;
const trialsCount = metrics.trials_count || 0;
const customersCount = metrics.customers_count || 0;
const churnCount = metrics.churn_count || 0;
const atRiskCount = metrics.at_risk_count || 0;
```

## Impacto

| Antes | Después |
|-------|---------|
| 5 queries × 221k registros = TIMEOUT | 1 RPC optimizado = <200ms |
| Base de datos bloqueada | Base de datos respira |

## Archivo a Modificar

| Archivo | Acción |
|---------|--------|
| `src/hooks/useMetrics.ts` | Reemplazar 5 COUNT queries por llamada a `dashboard_metrics` RPC |

---

**Al aprobar este plan, saldré del modo READ-ONLY y ejecutaré el cambio inmediatamente.**
