
# Plan: Corregir Parsing de dashboard_metrics RPC

## Problema Identificado

El RPC `dashboard_metrics` devuelve campos con nombres **diferentes** a los que el código espera:

| Campo del RPC (real) | Campo en código (incorrecto) |
|---------------------|------------------------------|
| `lead_count` | `leads_count` |
| `trial_count` | `trials_count` |
| `customer_count` | `customers_count` |
| `churn_count` | `churn_count` (correcto) |
| `converted_count` | `converted_count` (correcto) |

## Solución

Modificar `src/hooks/useMetrics.ts` para:

1. **Agregar console.log de depuración** para ver exactamente qué devuelve el RPC
2. **Corregir los nombres de campos** para que coincidan con lo que devuelve el RPC
3. **Garantizar que setIsLoading(false) siempre se ejecute** incluso con datos vacíos

## Cambios en código

Archivo: `src/hooks/useMetrics.ts`

### Cambio 1: Agregar console.log de depuración (línea ~230)
```typescript
const { data: dashboardData, error: dashboardError } = await supabase.rpc('dashboard_metrics' as any);

// DEBUG: Ver qué devuelve el RPC
console.log('dashboard_metrics RPC response:', { dashboardData, dashboardError });
```

### Cambio 2: Corregir mapeo de campos (líneas ~233-244)
```typescript
// ANTES (incorrecto):
const dbMetrics = dashboardData[0] as {
  leads_count?: number;    // ❌ No existe
  trials_count?: number;   // ❌ No existe
  customers_count?: number; // ❌ No existe
  churn_count?: number;
  converted_count?: number;
};
finalLeadCount = dbMetrics.leads_count || 0;

// DESPUÉS (correcto):
const dbMetrics = dashboardData[0] as {
  lead_count?: number;     // ✅ Nombre real
  trial_count?: number;    // ✅ Nombre real  
  customer_count?: number; // ✅ Nombre real
  churn_count?: number;
  converted_count?: number;
};
finalLeadCount = dbMetrics.lead_count || 0;
finalTrialCount = dbMetrics.trial_count || 0;
finalCustomerCount = dbMetrics.customer_count || 0;
```

## Resumen Técnico

| Archivo | Líneas | Cambio |
|---------|--------|--------|
| `src/hooks/useMetrics.ts` | ~230-250 | Corregir nombres de campos del RPC (singular vs plural) |

## Impacto

- El dashboard cargará correctamente mostrando los conteos de lifecycle (Leads, Trials, Customers, Churn)
- El círculo de loading desaparecerá al completar la carga
- Los KPIs mostrarán los valores reales de la base de datos

## Siguiente Paso

Al aprobar este plan, modificaré inmediatamente el archivo para corregir el parsing y eliminar el loading infinito.
