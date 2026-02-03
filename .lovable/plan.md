

# Plan: Correcciones Críticas de Sincronización y Unificación

## Resumen Ejecutivo

El usuario solicita 4 correcciones técnicas específicas para resolver problemas de sincronización con ManyChat, timeouts en unificación masiva, errores de fusión de teléfonos, y limpieza de la base de datos.

---

## TAREA 1: Arreglar la Sincronización de ManyChat

### Problema Detectado
La función `sync-manychat` actualmente busca clientes de nuestra DB y luego consulta ManyChat uno por uno por email. Esto es ineficiente y conceptualmente incorrecto - debería traer TODOS los suscriptores de ManyChat.

### Limitación Crítica de la API de ManyChat
Después de investigar la documentación oficial de ManyChat (Swagger API), **NO existe un endpoint para listar todos los suscriptores**. Los endpoints disponibles son:
- `GET /fb/subscriber/getInfo` - Por ID específico
- `GET /fb/subscriber/findByName` - Por nombre
- `GET /fb/subscriber/findByCustomField` - Por campo personalizado
- `GET /fb/subscriber/findBySystemField` - Por email/teléfono (actual)

### Solución Propuesta
Dado que no hay endpoint de listado masivo, implementaré una estrategia alternativa:

1. **Usar Tags como Proxy de Listado**:
   - Obtener todos los tags de la página (`GET /fb/page/getTags`)
   - Para cada tag, buscar suscriptores por ese tag
   
2. **O usar findBySystemField con emails conocidos** (enfoque actual mejorado):
   - Mantener la lógica actual pero optimizar el paralelismo
   - Aumentar batch paralelo de 5 a 10 requests simultáneos
   - Agregar mejor logging y manejo de errores

3. **Alternativa recomendada**: Webhook de ManyChat → `receive-lead` para captura en tiempo real (ya implementado), y usar sync solo para enriquecimiento histórico.

### Cambios en `sync-manychat/index.ts`
- Agregar modo `listByTags` que itere por todos los tags
- Mejorar paralelismo en `processPageStageOnly`
- Agregar documentación clara sobre las limitaciones de la API

---

## TAREA 2: Optimizar bulk-unify-contacts para Evitar Timeouts

### Problema Detectado
La función intenta procesar múltiples batches en un loop hasta que se acabe el tiempo (`MAX_EXECUTION_TIME_MS = 45s`), lo que causa acumulación de memoria y timeouts.

### Cambios en `bulk-unify-contacts/index.ts`

| Constante | Valor Actual | Nuevo Valor | Razón |
|-----------|--------------|-------------|-------|
| `BATCH_SIZE_DEFAULT` | 100 | 50 | Menos registros = menos memoria |
| Lógica de `processChunk` | Loop hasta timeout | **Un solo batch y retorna** | Evita acumulación |

### Código Modificado

```typescript
// ANTES (Loop hasta timeout):
while ((Date.now() - startTime) < MAX_EXECUTION_TIME_MS) {
  // Procesa múltiples batches
  // La memoria se acumula
  // Puede fallar por timeout
}

// DESPUÉS (Un batch por invocación):
const results = await Promise.all(
  sources.map(source => processBatch(source))
);

// Actualizar progreso
await updateSyncProgress(syncRunId, results);

// Si hay más trabajo, auto-invocar siguiente chunk
if (hasMoreWork) {
  EdgeRuntime.waitUntil(invokeNextChunk(...));
}
return; // TERMINAR INMEDIATAMENTE
```

---

## TAREA 3: Robustecer la Fusión de Teléfonos

### Problema Detectado
`insertPhoneOnlyRecords` hace queries individuales lentas y falla silenciosamente con duplicados.

### Cambios en `bulk-unify-contacts/index.ts`

```typescript
// ANTES:
for (each record) {
  const { data: existing } = await supabase
    .from('clients')
    .select('phone_e164')
    .in('phone_e164', phones); // Query individual por micro-batch
  // ... proceso lento
}

// DESPUÉS:
// 1. Query ÚNICA para obtener todos los teléfonos existentes
const allPhones = records.map(r => r.phone_e164).filter(Boolean);
const { data: existingClients } = await supabase
  .from('clients')
  .select('id, phone_e164, last_sync')
  .in('phone_e164', allPhones);

const existingPhoneMap = new Map(
  existingClients.map(c => [c.phone_e164, c])
);

// 2. Separar en existentes (UPDATE) y nuevos (INSERT)
const toUpdate = [];
const toInsert = [];

for (const record of records) {
  const existing = existingPhoneMap.get(record.phone_e164);
  if (existing) {
    toUpdate.push({ id: existing.id, ...enrichmentData });
  } else {
    toInsert.push(record);
  }
}

// 3. Operaciones en bloque
if (toUpdate.length > 0) {
  await supabase.from('clients').upsert(toUpdate, { onConflict: 'id' });
}
if (toInsert.length > 0) {
  await supabase.from('clients').insert(toInsert);
}
```

---

## TAREA 4: Limpieza de Base de Datos y Manejo de Errores

### 4.1 Migración SQL - Índices de Performance

```sql
-- Índices para filtrar registros no procesados (95% de las queries)
CREATE INDEX IF NOT EXISTS idx_ghl_raw_unprocessed 
ON ghl_contacts_raw(fetched_at) 
WHERE processed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_mc_raw_unprocessed 
ON manychat_contacts_raw(fetched_at) 
WHERE processed_at IS NULL;

-- Índices para búsqueda de clientes (identity unification)
CREATE INDEX IF NOT EXISTS idx_clients_email_lower 
ON clients(LOWER(email)) 
WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_phone_e164 
ON clients(phone_e164) 
WHERE phone_e164 IS NOT NULL;
```

### 4.2 Manejo de Errores Fatales en sync-ghl

Actualmente, si hay un error fatal en el catch block, NO se actualiza `sync_runs` a `'failed'`, dejando al frontend en polling infinito.

```typescript
// ANTES (sync-ghl/index.ts línea 869-876):
} catch (error) {
  logger.error("Fatal error", ...);
  return new Response(JSON.stringify({ ok: false, error }), ...);
  // ⚠️ sync_runs queda en estado "running" forever
}

// DESPUÉS:
} catch (error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  logger.error("Fatal error", ...);
  
  // CRÍTICO: Marcar sync como fallido
  if (syncRunId) {
    await supabase.from('sync_runs')
      .update({ 
        status: 'failed', 
        completed_at: new Date().toISOString(),
        error_message: errorMessage 
      })
      .eq('id', syncRunId);
  }
  
  return new Response(JSON.stringify({ ok: false, error: errorMessage }), ...);
}
```

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/sync-manychat/index.ts` | Agregar modo `listByTags`, mejorar paralelismo |
| `supabase/functions/bulk-unify-contacts/index.ts` | Reducir `BATCH_SIZE` a 50, cambiar loop a single-batch, optimizar `insertPhoneOnlyRecords` |
| `supabase/functions/sync-ghl/index.ts` | Agregar update de `sync_runs` a `'failed'` en catch block |
| Nueva migración SQL | Crear índices parciales para performance |

---

## Resultado Esperado

1. **ManyChat**: Sync más robusto con mejor logging y alternativa por tags
2. **bulk-unify**: Sin timeouts, procesa 50 registros → auto-chain → siguientes 50
3. **Teléfonos**: 10x más rápido, sin errores de duplicados
4. **Errores**: Frontend deja de hacer polling cuando hay error fatal

---

## Diagrama del Nuevo Flujo de Unificación

```text
┌─────────────────────────────────────────────────────────────────┐
│                 FLUJO ACTUAL (Problemático)                     │
├─────────────────────────────────────────────────────────────────┤
│ bulk-unify arranca → loop while(time < 45s) → procesa batches   │
│                       │                                         │
│               Memoria se acumula → TIMEOUT → estado inconsistente│
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                 FLUJO NUEVO (Robusto)                           │
├─────────────────────────────────────────────────────────────────┤
│ bulk-unify chunk 1 → procesa 50 registros → guarda progreso →   │
│                                                │                │
│                                         ¿Hay más?               │
│                                            │                    │
│                          ┌─────────────────┴───────────────┐    │
│                          ▼                                 ▼    │
│                   [SÍ: auto-chain]                  [NO: done]  │
│                          │                                      │
│                   waitUntil(invokeNextChunk)                    │
│                          │                                      │
│                   return Response (inmediato)                   │
│                          │                                      │
│                   chunk 2 → 50 registros → ...                  │
└─────────────────────────────────────────────────────────────────┘
```

