
# Plan: Fix - Auto-continuación para Sincronización de Facturas

## Problema Detectado

| Diagnóstico | Detalle |
|-------------|---------|
| Causa | Supabase Edge Runtime shutdown después de ~60s de background |
| Evidencia | `LOG shutdown` a las 16:28:02 justo después de page 42 |
| Resultado | Sync se quedó en `running` con 4200 facturas, cursor guardado |
| Faltan | ~10,000+ facturas más (tenemos 4200 de ~15,000) |

## Solución: Sistema de Auto-Reanudación

La función debe:
1. Limitar cada ejecución a ~20-25 páginas máximo (antes del shutdown de 60s)
2. Cuando termina el lote, llamarse a sí misma con el cursor guardado
3. Retomar desde el último checkpoint automáticamente

## Arquitectura Propuesta

```text
┌─────────────────────────────────────────────────────────────┐
│                    Ejecución 1                              │
├─────────────────────────────────────────────────────────────┤
│  Páginas 1-25 → 2500 facturas                               │
│  Guarda cursor en sync_runs                                 │
│  Se auto-llama con { syncRunId, cursor }                   │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Ejecución 2                              │
├─────────────────────────────────────────────────────────────┤
│  Lee cursor de sync_runs                                    │
│  Páginas 26-50 → 2500 facturas más                          │
│  Se auto-llama...                                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
                      ...
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                    Ejecución N (Final)                      │
├─────────────────────────────────────────────────────────────┤
│  Páginas 126-150 → últimas facturas                         │
│  hasMore = false                                            │
│  Marca sync como completed ✅                               │
└─────────────────────────────────────────────────────────────┘
```

## Cambios en fetch-invoices/index.ts

### 1. Agregar constante de límite de páginas por ejecución

```typescript
const PAGES_PER_BATCH = 25; // Procesar 25 páginas (~2500 facturas) por ejecución
```

### 2. Modificar `runFullInvoiceSync()` para auto-continuación

```typescript
async function runFullInvoiceSync(
  supabase: SupabaseClient,
  stripeSecretKey: string,
  syncRunId: string,
  mode: string,
  startDate: string | null,
  endDate: string | null,
  initialCursor: string | null  // ← NUEVO parámetro
) {
  let cursor = initialCursor;  // ← Usar cursor inicial si existe
  let hasMore = true;
  let pageCount = 0;
  let totalFetched = 0;
  let totalInserted = 0;
  
  // Leer progreso existente del sync run
  const { data: currentRun } = await supabase
    .from('sync_runs')
    .select('total_fetched, total_inserted')
    .eq('id', syncRunId)
    .single();
  
  totalFetched = currentRun?.total_fetched || 0;
  totalInserted = currentRun?.total_inserted || 0;
  
  while (hasMore && pageCount < PAGES_PER_BATCH) {  // ← Límite de páginas
    pageCount++;
    // ... proceso de página igual ...
    
    totalFetched += invoices.length;
    totalInserted += upserted;
    cursor = result.nextCursor;
    hasMore = result.hasMore && cursor !== null;
    
    // Actualizar checkpoint siempre
    await supabase.from('sync_runs').update({
      status: hasMore ? 'continuing' : 'completed',
      total_fetched: totalFetched,
      total_inserted: totalInserted,
      checkpoint: hasMore ? { cursor } : null,
      completed_at: hasMore ? null : new Date().toISOString(),
    }).eq('id', syncRunId);
  }
  
  // AUTO-CONTINUACIÓN: Si hay más páginas, llamar a otra instancia
  if (hasMore && cursor) {
    console.log(`🔄 [Background] Batch limit reached. Scheduling continuation...`);
    
    // Llamar a la misma función para continuar
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Usar fetch directo con service role key para auto-invocación
    await fetch(`${supabaseUrl}/functions/v1/fetch-invoices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`
      },
      body: JSON.stringify({
        mode,
        fetchAll: true,
        syncRunId,
        cursor,
        startDate,
        endDate,
        _continuation: true  // Flag para bypass checks
      })
    });
    
    console.log(`🚀 [Background] Continuation scheduled for cursor ${cursor.slice(0,10)}...`);
  }
}
```

### 3. Modificar handler principal para aceptar continuaciones

```typescript
// En el handler, después de parsear body:
const isContinuation = body._continuation === true;

// Modificar el check de "sync already running" para permitir continuaciones
if (existingSync && !syncRunId && !isContinuation) {
  // ... bloquear duplicados ...
}

// Si es continuación, usar el syncRunId y cursor del body
if (isContinuation && body.syncRunId && body.cursor) {
  console.log(`🔄 Continuation request for sync ${body.syncRunId}`);
  
  EdgeRuntime.waitUntil(
    runFullInvoiceSync(supabase, STRIPE_SECRET_KEY, body.syncRunId, mode, startDate, endDate, body.cursor)
  );
  
  return new Response(
    JSON.stringify({ success: true, status: 'continuing', syncRunId: body.syncRunId }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

## Acciones Inmediatas

### 1. Cancelar el sync atascado y reiniciar

```sql
UPDATE sync_runs 
SET status = 'cancelled', 
    completed_at = NOW(),
    error_message = 'Cancelled for restart with auto-continuation'
WHERE id = 'f292c5ce-915a-4be3-98d9-c2fe27aa9d7b';
```

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/fetch-invoices/index.ts` | Agregar `PAGES_PER_BATCH`, auto-continuación, aceptar `_continuation` |

## Detalles Técnicos

### Modificaciones específicas

**Línea 4 - Nueva constante:**
```typescript
const PAGES_PER_BATCH = 25; // ~25 páginas * ~2s = ~50s (dentro del límite de 60s)
```

**Líneas 461-553 - Función `runFullInvoiceSync` actualizada:**
- Agregar parámetro `initialCursor: string | null`
- Leer `total_fetched` y `total_inserted` existentes del sync run antes de sumar
- Cambiar condición del while: `pageCount < PAGES_PER_BATCH` en lugar de `pageCount < 500`
- Agregar bloque de auto-continuación al final

**Líneas 592-604 - Parseo de body actualizado:**
```typescript
let isContinuation = false;

try {
  const body = await req.json();
  // ... parseo existente ...
  isContinuation = body._continuation === true;
} catch {}
```

**Líneas 607-650 - Check de sync duplicado actualizado:**
```typescript
// Permitir continuaciones incluso si hay sync running
if (existingSync && !syncRunId && !isContinuation) {
  // ... bloquear ...
}

// Nuevo bloque para manejar continuaciones
if (isContinuation && syncRunId && cursor) {
  EdgeRuntime.waitUntil(
    runFullInvoiceSync(supabase, STRIPE_SECRET_KEY, syncRunId, mode, startDate, endDate, cursor)
  );
  
  return new Response(
    JSON.stringify({ success: true, status: 'continuing', syncRunId }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

## Resultado Esperado

| Métrica | Antes | Después |
|---------|-------|---------|
| Páginas por ejecución | Ilimitadas (crash) | 25 máximo |
| Auto-reanudación | ❌ | ✅ |
| Tiempo total 15k facturas | ∞ (atascado) | ~6-8 minutos (6 batches) |
| Resistente a shutdown | ❌ | ✅ |

**La sincronización ahora procesará las ~15,000 facturas en 5-6 lotes automáticos sin atascarse.**
