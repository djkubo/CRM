
# Plan de Corrección: Sincronización de Facturas

## Diagnóstico del Problema

Tras analizar los logs y el código, identifiqué **2 problemas críticos**:

### Problema 1: Contadores se Sobrescriben en Lugar de Sumar
En `fetch-invoices/index.ts` línea 661:
```typescript
total_fetched: invoices.length,  // ❌ Sobreescribe con 100 cada página
total_inserted: upsertedCount,   // ❌ Sobreescribe con 100 cada página
```

**Comportamiento actual**: Cada página resetea los contadores a 100, por eso ves `total_fetched: 0` o `total_fetched: 100` independientemente de cuántas páginas se hayan procesado.

**Comportamiento esperado**: Los contadores deben SUMAR incrementalmente.

### Problema 2: Frontend Inicia Nuevos Syncs Antes de que se Actualice el Estado
El check de "sync already running" detecta el sync que acaba de crear, bloqueando la continuación.

---

## Correcciones Requeridas

### 1. Edge Function `fetch-invoices`: Contadores Incrementales

```typescript
// Antes de actualizar, leer los contadores actuales
const { data: currentRun } = await supabase
  .from('sync_runs')
  .select('total_fetched, total_inserted')
  .eq('id', syncRunId)
  .single();

const currentFetched = currentRun?.total_fetched || 0;
const currentInserted = currentRun?.total_inserted || 0;

// Actualizar SUMANDO los nuevos valores
await supabase
  .from('sync_runs')
  .update({
    status: hasMore ? 'continuing' : 'completed',
    total_fetched: currentFetched + invoices.length,  // ✅ Sumar
    total_inserted: currentInserted + upsertedCount,  // ✅ Sumar
    checkpoint: hasMore ? { cursor: nextCursor } : null,
    completed_at: hasMore ? null : new Date().toISOString(),
  })
  .eq('id', syncRunId);
```

### 2. Edge Function `fetch-invoices`: Mejorar Check de Duplicados

Cuando el frontend pasa un `syncRunId`, NO debe bloquear el sync:
```typescript
// Solo bloquear si NO tenemos syncRunId y hay uno running reciente
if (!syncRunId) {
  // Check for existing...
}
// Si tenemos syncRunId, continuar inmediatamente
```

### 3. Añadir Logging para Debugging

```typescript
console.log(`📈 Updated sync run ${syncRunId}: 
  fetched: ${currentFetched} + ${invoices.length} = ${currentFetched + invoices.length}
  inserted: ${currentInserted} + ${upsertedCount} = ${currentInserted + upsertedCount}`);
```

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/fetch-invoices/index.ts` | Contadores incrementales + logging mejorado |

---

## Limpieza Requerida

Cancelar syncs bloqueados actuales:
```sql
UPDATE sync_runs 
SET status = 'cancelled', 
    completed_at = NOW(),
    error_message = 'Limpieza - corrección de contadores'
WHERE source = 'stripe_invoices' 
AND status IN ('running', 'continuing');
```

---

## Resultado Esperado

Después de aplicar estos cambios:
1. La primera página creará un sync_run con `total_fetched: 100`
2. La segunda página actualizará a `total_fetched: 200`
3. La tercera página actualizará a `total_fetched: 300`
4. Y así sucesivamente hasta completar todas las facturas

El frontend podrá mostrar el progreso real y la sincronización se completará correctamente.

---

## Sección Técnica

### Flujo de Datos Corregido

```text
Frontend llama fetch-invoices (page 1)
  ├─ Crea sync_run con status='running'
  ├─ Procesa 100 facturas
  ├─ Actualiza sync_run: total_fetched=100, status='continuing'
  └─ Retorna: {hasMore: true, nextCursor: "in_xxx", syncRunId: "abc"}

Frontend llama fetch-invoices (page 2, syncRunId="abc")
  ├─ Lee sync_run actual: total_fetched=100
  ├─ Procesa 100 facturas más
  ├─ Actualiza sync_run: total_fetched=200 (100+100)
  └─ Retorna: {hasMore: true, nextCursor: "in_yyy"}

... continúa hasta hasMore=false
```

### Consideraciones de Performance
- El SELECT adicional para leer contadores actuales añade ~10ms por página
- Esto es insignificante comparado con el tiempo de fetch de Stripe (~5-15s por página)
