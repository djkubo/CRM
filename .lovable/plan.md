

# Plan: Publicar Cambios a Producción

## Problema Identificado

La migración que corrige el formato de los RPCs se aplicó solo en el ambiente de **Test**, pero no en **Production**. Por eso siguen apareciendo los errores en consola.

| Ambiente | Función kpi_sales_summary | Formato |
|----------|---------------------------|---------|
| **Test** | `json_agg(row_to_json(t))` | ✅ Array `[{sales_usd:...}]` |
| **Production** | `json_build_object(...)` | ❌ Objeto `{total_usd:...}` |

El frontend verifica `Array.isArray(salesSummary)` y falla porque Production devuelve un objeto, no un array.

---

## Solución

### Opción 1: Publicar los Cambios (Recomendado)

El proyecto necesita ser **publicado** para que los cambios de la migración de base de datos se apliquen a producción.

**Acción requerida por el usuario:**
1. Hacer clic en el botón **Publish** en Lovable
2. Esto sincronizará el schema de Test a Production

---

### Opción 2: Hacer el Frontend Compatible con Ambos Formatos

Modificar `src/hooks/useMetrics.ts` para aceptar tanto objeto como array:

```typescript
// Línea 93-96: Cambiar la verificación
const { data: salesSummary, error: rpcError } = await supabase.rpc('kpi_sales_summary' as any);

// Normalizar: si es objeto, convertir a array
let salesArray: any[] = [];
if (!rpcError && salesSummary) {
  salesArray = Array.isArray(salesSummary) ? salesSummary : [salesSummary];
}

if (salesArray.length > 0) {
  const summary = salesArray[0];
  // Aceptar ambos nombres de campo: sales_usd o total_usd
  salesMonthUSD = (summary.sales_usd ?? summary.total_usd ?? 0) / 100;
  // ...etc
}
```

Esta opción hace que el código funcione tanto con la versión antigua como con la nueva de los RPCs.

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/hooks/useMetrics.ts` | Normalizar respuesta RPC para aceptar objeto o array |

---

## Recomendación

Implementar la **Opción 2** como solución inmediata y permanente, ya que:
- Hace el código más robusto ante cambios de formato
- Funciona inmediatamente sin esperar publicación
- Elimina los mensajes de error en consola
- Es compatible con ambos ambientes

---

## Sección Técnica

### Cambios en useMetrics.ts

**Para `kpi_sales_summary` (líneas 90-137):**
```typescript
// Antes:
if (!rpcError && salesSummary && Array.isArray(salesSummary) && salesSummary.length > 0) {
  const summary = salesSummary[0] as { sales_usd?: number; ... };

// Después:
if (!rpcError && salesSummary) {
  const salesArray = Array.isArray(salesSummary) ? salesSummary : [salesSummary];
  if (salesArray.length > 0) {
    const summary = salesArray[0] as any;
    // Aceptar ambos nombres: sales_usd (nuevo) o total_usd (viejo)
    salesMonthUSD = ((summary.sales_usd ?? summary.total_usd ?? 0) / 100);
```

**Para `dashboard_metrics` (líneas 164-199):**
```typescript
// Antes:
if (!dashboardError && dashboardData && Array.isArray(dashboardData) && dashboardData.length > 0) {

// Después:
if (!dashboardError && dashboardData) {
  const metricsArray = Array.isArray(dashboardData) ? dashboardData : [dashboardData];
  if (metricsArray.length > 0) {
```

