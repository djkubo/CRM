
# Plan: Optimización de Sincronización Stripe

## Estado Actual

| Componente | Estado | Registros |
|------------|--------|-----------|
| Transacciones Stripe | ✅ Funcional | 118,745 |
| Subscripciones | ⚠️ Necesita optimizar | 1,642 |
| Clientes Stripe | ✅ Funcional | 5,000 |
| Invoices | 🔄 En sincronización | ~13,000+ |

## Diagnóstico

### Transacciones Stripe (`fetch-stripe`)
La función ya tiene una arquitectura robusta con `EdgeRuntime.waitUntil` que hace la paginación completa en background. **No necesita cambios en el backend**.

El problema actual en el frontend es que usa "chunks de 31 días" que crea múltiples syncs y causa bloqueos "sync already running".

### Subscripciones (`fetch-subscriptions`)
Similar a transacciones, usa `EdgeRuntime.waitUntil` correctamente.

### Clientes (`fetch-customers`)
Ya tiene paginación interna y funciona correctamente.

---

## Solución: Simplificar Frontend para Stripe

### Cambio 1: Llamada Única para Historial Completo

```text
Antes (ineficiente):
  for each chunk (36 chunks de 31 días) {
    fetch-stripe(startDate, endDate) → Crea NUEVO sync
    ↓ Bloqueo: "sync already running"
  }

Después (eficiente):
  fetch-stripe(startDate: 3 años atrás, endDate: ahora) → UN sync
  ↓ Backend procesa todo en background automáticamente
  Opcional: Polling de sync_runs para progreso
```

### Cambio 2: Polling de Progreso (Opcional)

Agregar polling al `sync_runs` para mostrar progreso en tiempo real mientras el backend procesa:

```text
┌─────────────────────────────────────────────────────────────┐
│                 Frontend Simplificado                       │
├─────────────────────────────────────────────────────────────┤
│  1. Una sola llamada: fetch-stripe({                       │
│       fetchAll: true,                                       │
│       startDate: "2023-01-27",  // 3 años atrás            │
│       endDate: "2026-01-27"                                 │
│     })                                                      │
│                                                             │
│  2. Recibe: { syncRunId: "abc123", status: "running" }     │
│                                                             │
│  3. Polling opcional cada 3s:                               │
│     SELECT total_fetched, status FROM sync_runs            │
│     WHERE id = "abc123"                                     │
│                                                             │
│  4. Mostrar: "Sincronizando: 45,000 de ~120,000..."        │
└─────────────────────────────────────────────────────────────┘
```

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/dashboard/APISyncPanel.tsx` | Simplificar `syncStripe` para usar una sola llamada + polling |

---

## Cambios Específicos en APISyncPanel.tsx

### Función `syncStripe` Optimizada

Reemplazar `syncInChunks('stripe', ...)` con una llamada directa:

```typescript
const syncStripe = async (mode: 'last24h' | 'last31d' | 'all6months' | 'allHistory') => {
  setStripeSyncing(true);
  setStripeResult(null);
  
  try {
    let startDate: Date | undefined;
    const endDate = new Date();
    
    switch (mode) {
      case 'last24h':
        startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'last31d':
        startDate = new Date(endDate.getTime() - 31 * 24 * 60 * 60 * 1000);
        break;
      case 'all6months':
        startDate = new Date(endDate.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);
        break;
      case 'allHistory':
        startDate = new Date(endDate.getTime() - 3 * 365 * 24 * 60 * 60 * 1000);
        break;
    }
    
    // UNA sola llamada - el backend hace toda la paginación
    const data = await invokeWithAdminKey<FetchStripeResponse, FetchStripeBody>(
      'fetch-stripe', 
      { 
        fetchAll: true,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      }
    );

    if (data.status === 'running' && data.syncRunId) {
      // Iniciar polling de progreso
      pollSyncProgress(data.syncRunId, 'stripe');
      
      toast.info('Stripe: Sincronización iniciada en background...', { 
        id: 'stripe-sync' 
      });
    } else if (data.success) {
      setStripeResult(data);
      toast.success(`Stripe: ${data.synced_transactions ?? 0} transacciones sincronizadas`);
    }
    
    queryClient.invalidateQueries({ queryKey: ['transactions'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    setStripeResult({ success: false, error: errorMessage });
    toast.error(`Error sincronizando Stripe: ${errorMessage}`);
  } finally {
    setStripeSyncing(false);
  }
};

// Nueva función de polling
const pollSyncProgress = async (syncRunId: string, source: string) => {
  const poll = async () => {
    const { data } = await supabase
      .from('sync_runs')
      .select('status, total_fetched, total_inserted')
      .eq('id', syncRunId)
      .single();
    
    if (data?.status === 'running' || data?.status === 'continuing') {
      setStripeProgress({ current: data.total_fetched || 0, total: 0 });
      toast.info(`Stripe: ${data.total_fetched || 0} transacciones...`, { 
        id: 'stripe-sync' 
      });
      setTimeout(poll, 3000);
    } else if (data?.status === 'completed') {
      setStripeProgress(null);
      setStripeResult({ 
        success: true, 
        synced_transactions: data.total_inserted,
        message: 'Sincronización completada'
      });
      toast.success(`Stripe: ${data.total_inserted} transacciones sincronizadas`, {
        id: 'stripe-sync'
      });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    }
  };
  
  poll();
};
```

---

## Resultado Esperado

- ✅ Una sola llamada inicia toda la sincronización
- ✅ Sin bloqueos "sync already running" 
- ✅ El backend procesa todo en background sin timeout
- ✅ Progreso visible en tiempo real
- ✅ Consistente con la arquitectura ya probada de facturas

---

## Nota Importante

Este cambio NO interrumpirá el proceso de facturas actual porque:
1. Solo modifica código del frontend
2. El sync de facturas usa un `syncRunId` diferente
3. Stripe transacciones y facturas son fuentes (`source`) distintas en `sync_runs`
