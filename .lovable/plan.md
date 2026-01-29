
# Plan de Reparación: Rendimiento del Botón "Unificar Todos"

## Resumen Ejecutivo

El botón "Unificar Todos" no congela la aplicación en el sentido técnico, pero presenta una **experiencia de usuario degradada** debido a:
1. Progreso que no avanza (0% por mucho tiempo)
2. Tiempos de procesamiento extremos (~18 horas teóricas para 800k registros)
3. Falta de feedback visual significativo
4. Sin capacidad de reanudar procesos fallidos

---

## Arquitectura Actual vs Propuesta

```text
┌─────────────────────────────────────────────────────────────────┐
│                    ARQUITECTURA ACTUAL                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Botón Unificar]                                               │
│        │                                                        │
│        ▼                                                        │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │ Edge Function   │────▶│ Background Task │                    │
│  │ bulk-unify      │     │ (waitUntil)     │                    │
│  └────────┬────────┘     └────────┬────────┘                    │
│           │                       │                             │
│           ▼                       ▼                             │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │ Respuesta       │     │ Procesa 500/    │                    │
│  │ Inmediata       │     │ iteración       │────▶ TIMEOUT       │
│  └─────────────────┘     └─────────────────┘      después de    │
│                                                   ~2 horas      │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    ARQUITECTURA PROPUESTA                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  [Botón Unificar]                                               │
│        │                                                        │
│        ▼                                                        │
│  ┌─────────────────┐                                            │
│  │ Edge Function   │──┐                                         │
│  │ (Chunk 1)       │  │    Auto-encadenamiento                  │
│  └─────────────────┘  │                                         │
│                       ▼                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ Chunk 2         │─▶│ Chunk 3         │─▶│ Chunk N         │  │
│  │ 10,000 records  │  │ 10,000 records  │  │ (hasta fin)     │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                 │
│  Cada chunk:                                                    │
│  - Persiste checkpoint en sync_runs                             │
│  - Auto-invoca siguiente chunk via fetch()                      │
│  - Se ejecuta en <50 segundos para evitar timeout               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Fases de Implementación

### Fase 1: Arreglo Inmediato del RPC (5 min)

**Problema**: `get_staging_counts_fast()` no distingue entre procesados y no-procesados.

**Solución**: Crear nueva función que haga conteos exactos pero con límites de tiempo.

```sql
CREATE OR REPLACE FUNCTION public.get_staging_counts_accurate()
RETURNS JSON
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET statement_timeout = '5s'
AS $$
  SELECT json_build_object(
    'ghl_total', (SELECT COUNT(*) FROM ghl_contacts_raw),
    'ghl_unprocessed', (SELECT COUNT(*) FROM ghl_contacts_raw WHERE processed_at IS NULL),
    'manychat_total', (SELECT COUNT(*) FROM manychat_contacts_raw),
    'manychat_unprocessed', (SELECT COUNT(*) FROM manychat_contacts_raw WHERE processed_at IS NULL),
    'csv_total', (SELECT COUNT(*) FROM csv_imports_raw),
    'csv_staged', (SELECT COUNT(*) FROM csv_imports_raw WHERE processing_status IN ('staged', 'pending')),
    'clients_total', (SELECT COUNT(*) FROM clients),
    'transactions_total', (SELECT COUNT(*) FROM transactions)
  );
$$;
```

---

### Fase 2: Optimización del Edge Function (20 min)

**Cambios en `bulk-unify-contacts/index.ts`**:

1. **Aumentar batch size** de 500 → 2,000 por fuente
2. **Implementar auto-encadenamiento** (como ya existe en `fetch-stripe`)
3. **Reducir delay entre batches** de 20ms → 5ms
4. **Añadir tiempo máximo por invocación** de 45 segundos
5. **Guardar cursor de progreso** para permitir resume

```typescript
// Patrón de auto-encadenamiento
const MAX_EXECUTION_TIME_MS = 45_000; // 45 segundos max

while (hasMoreWork && (Date.now() - startTime) < MAX_EXECUTION_TIME_MS) {
  // Procesar batches...
}

if (hasMoreWork) {
  // Auto-invoke next chunk
  EdgeRuntime.waitUntil(
    fetch(`${supabaseUrl}/functions/v1/bulk-unify-contacts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        syncRunId, 
        cursor: lastProcessedId,
        sources,
        batchSize 
      })
    })
  );
}
```

---

### Fase 3: UI de Progreso Mejorada (15 min)

**Cambios en `SyncOrchestrator.tsx`**:

1. **Mostrar ETA realista** basado en velocidad actual
2. **Polling adaptativo**: 5s cuando hay actividad, 15s cuando está estancado
3. **Botón "Reanudar"** visible si el último sync falló pero hay progreso guardado
4. **Indicador de chunks**: "Procesando chunk 4 de ~80"

```tsx
// Polling adaptativo
const pollInterval = unifyStats.rate.includes('0/s') ? 15000 : 5000;
setTimeout(pollProgress, pollInterval);

// Botón de Resume
{lastFailedSync && (
  <Button onClick={resumeUnification}>
    <Play className="h-4 w-4 mr-2" />
    Reanudar desde {lastFailedSync.total_fetched.toLocaleString()}
  </Button>
)}
```

---

### Fase 4: Índices de Base de Datos (10 min)

**Crear índices parciales** para acelerar las queries de conteo:

```sql
-- Índice parcial para GHL sin procesar (más rápido que escaneo completo)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ghl_raw_unprocessed 
ON ghl_contacts_raw (id) 
WHERE processed_at IS NULL;

-- Índice parcial para CSV pendientes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_csv_raw_staged 
ON csv_imports_raw (id) 
WHERE processing_status IN ('staged', 'pending');
```

---

## Estimaciones de Tiempo con Optimizaciones

| Escenario | Batch Size | Velocidad | Tiempo para 800k |
|-----------|------------|-----------|------------------|
| **Actual** | 500 | ~50/s | ~4.5 horas |
| **Optimizado** | 2,000 | ~200/s | ~1.1 horas |
| **Con índices** | 2,000 | ~400/s | ~35 min |

---

## Sección Técnica: Archivos a Modificar

1. **Nueva migración SQL**:
   - `supabase/migrations/XXX_fix_staging_counts_accurate.sql`
   - Crea RPC con conteos exactos + índices parciales

2. **Edge Function**:
   - `supabase/functions/bulk-unify-contacts/index.ts`
   - Auto-encadenamiento + batch size aumentado

3. **Frontend**:
   - `src/components/dashboard/SyncOrchestrator.tsx`
   - Polling adaptativo + botón resume + ETA mejorado

---

## Resultado Esperado

- **Antes**: "Unificar Todos" → UI parece congelada → Falla después de 2h
- **Después**: "Unificar Todos" → Progreso visible cada 5s → Completa en ~35-60 min → Si falla, puede reanudar
