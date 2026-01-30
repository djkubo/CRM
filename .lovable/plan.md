
# Plan: Arreglar RPCs que No Devuelven Datos Correctos

## Problema Detectado

El frontend muestra los logs:
```
kpi_sales_summary RPC not available, using limited fallback
dashboard_metrics RPC not available: undefined
```

### Causa Raíz

Los RPCs **existen y funcionan**, pero hay un **desajuste de formato**:

| Aspecto | Frontend espera | RPC devuelve |
|---------|-----------------|--------------|
| Tipo de retorno | Array `[{...}]` | Objeto JSON `{...}` |
| Campo ventas | `sales_usd` | `total_usd` |
| Campo ventas MXN | `sales_mxn` | `total_mxn` |

**Código problemático en useMetrics.ts línea 93-96:**
```typescript
const { data: salesSummary } = await supabase.rpc('kpi_sales_summary');
if (salesSummary && Array.isArray(salesSummary) && salesSummary.length > 0) {
  const summary = salesSummary[0] as { sales_usd?: number; ... }
```

El frontend verifica `Array.isArray(salesSummary)` pero el RPC devuelve un objeto JSON directo, por lo que la condición falla y usa el fallback lento.

---

## Solución: Actualizar RPCs para Retornar Arrays

Modificar ambos RPCs para:
1. Devolver un array con un solo objeto (formato que el frontend espera)
2. Renombrar `total_usd` → `sales_usd` y `total_mxn` → `sales_mxn`

### Nueva Migración SQL

```sql
-- ================================================
-- ARREGLAR RPCs para retornar formato de array
-- ================================================

-- 1. Recrear kpi_sales_summary con formato correcto
DROP FUNCTION IF EXISTS kpi_sales_summary();
CREATE FUNCTION kpi_sales_summary()
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT 
        COALESCE(month_usd, 0) as sales_usd,
        COALESCE(month_mxn, 0) as sales_mxn,
        COALESCE(today_usd, 0) as today_usd,
        COALESCE(today_mxn, 0) as today_mxn,
        COALESCE(refunds_usd, 0) as refunds_usd,
        COALESCE(refunds_mxn, 0) as refunds_mxn
      FROM mv_sales_summary
      LIMIT 1
    ) t
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- 2. Recrear dashboard_metrics con formato correcto  
DROP FUNCTION IF EXISTS dashboard_metrics();
CREATE FUNCTION dashboard_metrics()
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_agg(row_to_json(t))
    FROM (
      SELECT 
        COALESCE(lead_count, 0) as lead_count,
        COALESCE(trial_count, 0) as trial_count,
        COALESCE(customer_count, 0) as customer_count,
        COALESCE(churn_count, 0) as churn_count,
        (SELECT COUNT(*) FROM clients WHERE converted_at IS NOT NULL) as converted_count,
        '[]'::json as recovery_list
      FROM mv_client_lifecycle_counts
      LIMIT 1
    ) t
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;
```

---

## Verificación Esperada

Después del cambio, los RPCs retornarán:

**kpi_sales_summary():**
```json
[{"sales_usd": 326515, "sales_mxn": 11976, "today_usd": 0, ...}]
```

**dashboard_metrics():**
```json
[{"lead_count": 218674, "trial_count": 1, "customer_count": 2435, ...}]
```

Esto cumple con:
- ✅ `Array.isArray()` retorna `true`
- ✅ `data[0].sales_usd` existe
- ✅ `data[0].lead_count` existe

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| Nueva migración SQL | Recrear ambos RPCs con formato array |

---

## Impacto

- **Antes:** Dashboard usa fallback lento (500+ queries limitadas)
- **Después:** Dashboard usa RPCs instantáneos (~50ms cada uno)
- Los logs de "RPC not available" desaparecerán
