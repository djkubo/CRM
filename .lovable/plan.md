
# Plan: Optimización de Sincronización de Facturas (fetch-invoices)

## Problema Detectado

| Métrica | Actual | Óptimo |
|---------|--------|--------|
| Velocidad | ~58 facturas/min | ~8,000+ facturas/min |
| Arquitectura | Frontend loop síncrono | Backend background processing |
| Tiempo para 15k facturas | ~4 horas (estimado) | ~2-3 minutos |

El sync de facturas usa un **loop síncrono en el frontend** que espera cada página antes de pedir la siguiente. Mientras tanto, `fetch-stripe` usa `EdgeRuntime.waitUntil()` para procesar todo en background.

## Arquitectura Actual vs Deseada

```text
ACTUAL (Lento):
┌────────────┐    página 1     ┌────────────┐
│  Frontend  │ ────────────►   │  Backend   │
│            │ ◄────────────   │            │
│  (espera)  │    ~700ms      │            │
│            │    página 2     │            │
│            │ ────────────►   │            │
│            │ ◄────────────   │            │
│  (espera)  │    ~700ms      │            │
└────────────┘     ...x150     └────────────┘
Total: 150 × 700ms = 105 segundos mínimo

DESEADO (Rápido):
┌────────────┐   fetchAll:true  ┌────────────┐
│  Frontend  │ ────────────────►│  Backend   │
│            │   "running"      │ waitUntil  │──► Stripe API
│            │ ◄────────────────│            │      página 1
│  polling   │                  │            │      página 2
│  cada 3s   │                  │            │      ...
│            │                  │  ───────►  │      página 150
└────────────┘                  └────────────┘
Total: ~60-120 segundos en background
```

## Solución

### 1. Backend: Agregar `EdgeRuntime.waitUntil()` a fetch-invoices

Modificar `supabase/functions/fetch-invoices/index.ts` para que procese TODAS las páginas en background cuando `fetchAll: true`:

```typescript
// Nueva función para background processing
async function runFullInvoiceSync(
  supabase: SupabaseClient,
  stripeSecretKey: string,
  syncRunId: string,
  mode: string,
  startDate: string | null,
  endDate: string | null,
  initialCursor: string | null
) {
  let cursor = initialCursor;
  let hasMore = true;
  let pageCount = 0;
  let totalFetched = 0;
  let totalInserted = 0;

  while (hasMore && pageCount < 500) {
    pageCount++;
    
    // Fetch page from Stripe
    const result = await fetchSinglePage(stripeSecretKey, mode, startDate, endDate, cursor);
    
    // Batch upsert (ya optimizado)
    const upserted = await batchUpsertInvoices(supabase, result.invoices);
    
    totalFetched += result.invoices.length;
    totalInserted += upserted;
    cursor = result.nextCursor;
    hasMore = result.hasMore && cursor !== null;
    
    // Update progress
    await supabase.from('sync_runs').update({
      status: hasMore ? 'running' : 'completed',
      total_fetched: totalFetched,
      total_inserted: totalInserted,
      checkpoint: hasMore ? { cursor } : null,
      completed_at: hasMore ? null : new Date().toISOString()
    }).eq('id', syncRunId);
    
    // Small delay between pages
    if (hasMore) await delay(150);
  }
}

// En el handler principal
if (fetchAll) {
  EdgeRuntime.waitUntil(
    runFullInvoiceSync(supabase, stripeSecretKey, syncRunId, mode, startDate, endDate, null)
  );
  
  return Response.json({
    success: true,
    status: 'running',
    syncRunId,
    message: 'Sync iniciado en background'
  });
}
```

### 2. Frontend: Simplificar a una sola llamada

Modificar `src/components/dashboard/APISyncPanel.tsx`:

```typescript
const syncInvoices = async (mode: 'recent' | 'full') => {
  setInvoicesSyncing(true);
  setInvoicesResult(null);
  
  try {
    // UNA sola llamada - el backend hace todo
    const data = await invokeWithAdminKey<InvoiceSyncResponse>('fetch-invoices', {
      mode: mode === 'full' ? 'full' : 'recent',
      fetchAll: true
    });

    if (data.status === 'running' && data.syncRunId) {
      // Polling para ver progreso
      pollInvoiceProgress(data.syncRunId);
      toast.info('Facturas: Sincronización iniciada...', { id: 'invoices-sync' });
    } else if (data.success) {
      setInvoicesResult(data);
      toast.success(`Facturas: ${data.synced} sincronizadas`);
    }
  } catch (error) {
    // ... error handling
  }
};

// Polling similar al de Stripe
const pollInvoiceProgress = async (syncRunId: string) => {
  const poll = async () => {
    const { data } = await supabase
      .from('sync_runs')
      .select('status, total_fetched, total_inserted')
      .eq('id', syncRunId)
      .single();
    
    if (data?.status === 'running') {
      setInvoicesProgress({ current: data.total_fetched || 0, total: 0 });
      toast.info(`Facturas: ${(data.total_fetched || 0).toLocaleString()}...`, { id: 'invoices-sync' });
      setTimeout(poll, 3000);
    } else if (data?.status === 'completed') {
      // Done!
      toast.success(`Facturas: ${data.total_inserted} sincronizadas`, { id: 'invoices-sync' });
    }
  };
  poll();
};
```

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/fetch-invoices/index.ts` | Agregar `runFullInvoiceSync` + `EdgeRuntime.waitUntil` + parámetro `fetchAll` |
| `src/components/dashboard/APISyncPanel.tsx` | Cambiar `syncInvoices` a una sola llamada + polling |

## Detalles Técnicos

### Cambios en fetch-invoices/index.ts

1. Declarar EdgeRuntime al inicio:
```typescript
declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };
```

2. Refactorizar la lógica de página única a una función separada `processSingleInvoicePage()`

3. Crear `runFullInvoiceSync()` que:
   - Loop interno `while(hasMore)`
   - Batch upserts (ya existe)
   - Actualiza `sync_runs` cada página
   - Rate limit de 150ms entre páginas

4. En el handler principal, detectar `fetchAll: true` y usar `EdgeRuntime.waitUntil()`

### Cambios en APISyncPanel.tsx

1. Eliminar el loop `while(hasMore)` del frontend
2. Una sola llamada con `{ mode, fetchAll: true }`
3. Agregar función `pollInvoiceProgress()` con `useCallback` y `useRef`
4. Mostrar progreso en tiempo real

## Resultado Esperado

| Antes | Después |
|-------|---------|
| 700 facturas en 12 min | ~15,000 facturas en 2-3 min |
| Frontend bloqueado | Frontend libre, polling en background |
| Vulnerable a desconexión | Resistente - proceso continúa en servidor |

## Nota Importante

Esta optimización **NO interrumpirá** el proceso actual porque:
1. El sync en curso (id: `b0d05d41-cd33...`) está en estado `continuing`
2. Al desplegar los cambios, ese sync se marcará como "stale" y se reiniciará
3. Las ~700 facturas ya guardadas se mantendrán (upsert por `stripe_invoice_id`)
