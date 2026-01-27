
# Plan: Arreglar Smart Recovery y Stripe Sync

## Problemas Detectados

### 1. Smart Recovery 7 días ATASCADO
- **Sync ID**: `13525ae0-d83b-4751-bdc2-6bd6bd3554fc`
- **Status**: `running` desde hace 6+ minutos
- **Procesados**: 0 facturas
- **Causa**: El bucle no encuentra facturas pero queda en estado "running"

### 2. Bug de Precedencia de Operadores (CRÍTICO)
**Línea 441 de recover-revenue/index.ts:**
```javascript
// BUGGY - mal precedencia
const hasMore = stripeHasMore || invoicesToProcess.length === 0 && allInvoices.length > 0;
```

El operador `&&` tiene mayor precedencia que `||`, lo que causa:
- `stripeHasMore` se evalúa primero
- Luego `(invoicesToProcess.length === 0 && allInvoices.length > 0)` 
- Si `stripeHasMore = false` y `allInvoices = []`, entonces `hasMore = true` cuando debería ser `false`

### 3. Stripe Sync ATASCADO (57 minutos)
- **Sync ID**: `8b02c115-02fb-41ac-b2dd-62d2ab264408`
- **Status**: `running` pero el proceso background murió
- **Total**: 1795 transacciones procesadas antes de morir

### 4. Timeout de Smart Recovery Insuficiente
- El timeout actual es de 10 minutos (línea 340)
- Debería ser más agresivo (5 minutos) para liberar syncs atascados

---

## Solución

### Paso 1: Arreglar Bug de Precedencia (recover-revenue)

**Archivo**: `supabase/functions/recover-revenue/index.ts`

```typescript
// ANTES (línea 441) - BUGGY
const hasMore = stripeHasMore || invoicesToProcess.length === 0 && allInvoices.length > 0;

// DESPUÉS - CORRECTO
const hasMore = stripeHasMore || (invoicesToProcess.length === 0 && allInvoices.length > 0);
```

Además, agregar lógica para cerrar cuando no hay facturas:
```typescript
// Si no hay facturas en absoluto, cerrar inmediatamente
if (allInvoices.length === 0) {
  // Marcar como completado, no hay nada que procesar
  await supabaseService.from("sync_runs").update({
    status: "completed",
    completed_at: new Date().toISOString(),
  }).eq("id", syncRunId);
  
  return Response con hasMore: false
}
```

### Paso 2: Timeout Más Agresivo

**Archivo**: `supabase/functions/recover-revenue/index.ts`

```typescript
// ANTES (línea 340)
const isStale = Date.now() - startedAt > 10 * 60 * 1000; // 10 min

// DESPUÉS
const isStale = Date.now() - startedAt > 5 * 60 * 1000; // 5 min (más agresivo)
```

### Paso 3: Limpiar Syncs Atascados en fetch-stripe

**Archivo**: `supabase/functions/fetch-stripe/index.ts`

El código ya tiene auto-cleanup (líneas 696-707) pero el threshold de 3 minutos no es suficiente cuando hay syncs de 57+ minutos. Necesita limpieza más agresiva al iniciar.

### Paso 4: Agregar Mejor Manejo de "No Facturas"

Cuando Stripe retorna 0 facturas en el rango, el sync debe cerrarse inmediatamente como "completed" con mensaje claro.

---

## Cambios Específicos

### Archivo 1: `supabase/functions/recover-revenue/index.ts`

| Línea | Cambio |
|-------|--------|
| 27 | Reducir batch size para rangos grandes: `const BATCH_SIZE = 15` |
| 340 | Timeout más agresivo: `5 * 60 * 1000` |
| 415-420 | Agregar manejo cuando `allInvoices.length === 0` |
| 441 | Corregir precedencia: agregar paréntesis |
| 477 | Mejor lógica de cierre |

### Archivo 2: `supabase/functions/fetch-stripe/index.ts`

| Línea | Cambio |
|-------|--------|
| 696 | Threshold más agresivo para auto-cleanup: `3 * 60 * 1000` → funciona bien |
| 705-707 | Logging mejorado |

---

## Código Actualizado: recover-revenue/index.ts

### Sección 1: Manejo de "Sin Facturas" (después de línea 420)
```typescript
// Si no hay facturas en absoluto para este rango, cerrar inmediatamente
if (allInvoices.length === 0) {
  console.log(`📭 No invoices found in range ${hours_lookback}h. Marking as completed.`);
  
  await supabaseService
    .from("sync_runs")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      metadata: { ...existingMeta, no_invoices_found: true },
      checkpoint: { recovered_amount: 0, failed_amount: 0, skipped_amount: 0, processed: 0 },
    })
    .eq("id", syncRunId);

  return new Response(
    JSON.stringify({
      ok: true,
      status: "completed",
      syncRunId,
      processed: 0,
      hasMore: false,
      message: `No hay facturas abiertas en las últimas ${hours_lookback} horas`,
      // ... rest of response fields with 0s
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

### Sección 2: Corregir Precedencia (línea 441)
```typescript
// CORREGIDO: Paréntesis explícitos
const hasMore = stripeHasMore || (invoicesToProcess.length === 0 && allInvoices.length > 0);
```

### Sección 3: Timeout Agresivo (línea 340)
```typescript
// Cambiar de 10 min a 5 min
const isStale = Date.now() - startedAt > 5 * 60 * 1000;
```

---

## Resultado Esperado

Después de aplicar estos cambios:

1. **Smart Recovery 7/15/30/60 días** funcionará correctamente
2. **Si no hay facturas** → Se cierra inmediatamente como "completed"
3. **Syncs atascados** → Se limpian automáticamente después de 5 minutos
4. **El frontend** recibirá `hasMore: false` correctamente cuando no hay más
5. **Stripe Sync** no bloqueará nuevos syncs

---

## Archivos a Modificar

| Archivo | Acción |
|---------|--------|
| `supabase/functions/recover-revenue/index.ts` | MODIFICAR - Corregir bugs |
| `supabase/functions/fetch-stripe/index.ts` | VERIFICAR - Ya tiene auto-cleanup |

---

## SQL de Limpieza Inmediata (Ejecutar ahora)

Para desbloquear los syncs atascados actuales:

```sql
UPDATE sync_runs 
SET status = 'cancelled', 
    completed_at = now(), 
    error_message = 'Limpieza manual - sync atascado'
WHERE status IN ('running', 'continuing')
  AND started_at < now() - interval '5 minutes';
```

Esto liberará ambos syncs y permitirá nuevos intentos inmediatamente.
