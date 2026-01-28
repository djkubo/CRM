
# Plan: Optimización Definitiva de Smart Recovery

## Problemas Identificados

### 1. Error "inesperado" en el Frontend
- El hook `useSmartRecovery` no maneja correctamente algunos casos de error
- Si la respuesta no tiene la estructura esperada, falla silenciosamente

### 2. El Proceso se Cancela al Salir de la Página
- La ejecución actual depende del bucle `while(hasMore)` en el navegador
- Si cierras la pestaña, el proceso muere

### 3. No hay Visualización en Tiempo Real
- El frontend no tiene polling/suscripción a `sync_runs`
- Al recargar la página no se restaura correctamente el progreso activo

### 4. Lógica de Cobro Incompleta
- No se verifica si ya se intentó cobrar recientemente
- No hay límite de reintentos por factura

---

## Solución Arquitectónica

### Nueva Arquitectura: Backend-First con Polling Realtime

```text
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                         │
├─────────────────────────────────────────────────────────────────┤
│  SmartRecoveryCard                                              │
│  ├── Botón "Iniciar" → Llama Edge Function UNA vez              │
│  ├── Polling cada 3s a sync_runs mientras status = "running"   │
│  ├── Muestra progreso en tiempo real (checkpoint data)         │
│  └── Al recargar → Detecta run activo y muestra estado         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND (Edge Function)                      │
├─────────────────────────────────────────────────────────────────┤
│  recover-revenue (auto-continuation)                            │
│  ├── Procesa batch de 3 facturas                                │
│  ├── Guarda progreso en sync_runs.checkpoint                    │
│  ├── Si hasMore → Se auto-invoca con EdgeRuntime.waitUntil()   │
│  └── Frontend solo observa, no coordina                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Cambios Específicos

### Archivo 1: `supabase/functions/recover-revenue/index.ts`

**Cambios:**
1. Agregar auto-continuación con `EdgeRuntime.waitUntil()` (mismo patrón que fetch-stripe)
2. Agregar validación de "ya intentado hoy" para evitar spam a Stripe
3. Limitar reintentos por factura (máximo 3 en 24h)
4. Actualizar `checkpoint.lastActivity` para detectar stalls

```typescript
// Nuevo flujo:
// 1. Procesar batch
// 2. Si hasMore && !cancelled:
//    EdgeRuntime.waitUntil(fetch(self, { cursor: nextCursor }))
// 3. Retornar inmediatamente con status parcial
```

### Archivo 2: `src/hooks/useSmartRecovery.ts`

**Cambios:**
1. Eliminar bucle `while(hasMore)` del frontend
2. Implementar polling a `sync_runs` cada 3 segundos
3. Al montar, verificar si hay un run activo y mostrar su progreso
4. Manejar reconexión al recargar la página
5. Mejorar manejo de errores con mensajes claros

```typescript
// Nuevo flujo:
// 1. runRecovery() → Llama edge function UNA vez
// 2. Inicia polling a sync_runs cada 3s
// 3. Actualiza UI con datos del checkpoint
// 4. Al recargar → useEffect detecta run activo
```

### Archivo 3: `src/components/dashboard/SmartRecoveryCard.tsx`

**Cambios:**
1. Mostrar progreso detallado desde `sync_runs.checkpoint`
2. Mostrar tiempo transcurrido
3. Mostrar última actividad (para detectar si se atoró)
4. Botón "Forzar Cancelación" si detecta stall > 5 min

---

## Detalle de Cambios por Archivo

### recover-revenue/index.ts - Auto-Continuación

```typescript
// Al final del procesamiento:
if (hasMore) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  
  // Auto-invocar en background
  EdgeRuntime.waitUntil((async () => {
    await new Promise(r => setTimeout(r, 1000)); // 1s delay entre batches
    
    await fetch(`${supabaseUrl}/functions/v1/recover-revenue`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        hours_lookback,
        cursor: nextCursor,
        sync_run_id: syncRunId,
        _continuation: true, // Flag para identificar auto-invocación
      }),
    });
  })());
}
```

### useSmartRecovery.ts - Polling Pattern

```typescript
// Nuevo hook de polling
const pollSyncRun = useCallback(async (syncRunId: string) => {
  const { data } = await supabase
    .from("sync_runs")
    .select("*")
    .eq("id", syncRunId)
    .single();
  
  if (data) {
    const checkpoint = data.checkpoint as any;
    setProgress({
      batch: checkpoint?.processed || 0,
      message: `Procesadas ${checkpoint?.processed || 0} facturas`,
      recovered: checkpoint?.recovered_amount || 0,
      failed: checkpoint?.failed_amount || 0,
      skipped: checkpoint?.skipped_amount || 0,
    });
    
    if (data.status === "completed" || data.status === "failed") {
      // Terminar polling
      return true;
    }
  }
  return false;
}, []);

// En runRecovery:
// 1. Llamar edge function
// 2. Iniciar setInterval de 3s para polling
// 3. Limpiar interval cuando termine
```

### Verificación de Reintentos

```sql
-- Nueva columna en invoices o metadata en sync_runs
-- Track: invoice_id → { last_attempt: timestamp, attempt_count: number }
```

---

## Reglas de Cobro (Validaciones)

1. **NO cobrar** si la suscripción está `canceled` o `incomplete_expired`
2. **NO cobrar** si la factura está `paid`, `void`, o `uncollectible`
3. **NO cobrar** si ya se intentó en las últimas 24 horas (mismo invoice)
4. **MÁXIMO 3** intentos por factura en una ventana de 7 días
5. **DELAY** de 80ms entre llamadas a Stripe API

---

## Archivos a Modificar

| Archivo | Acción |
|---------|--------|
| `supabase/functions/recover-revenue/index.ts` | Agregar auto-continuación y validaciones |
| `src/hooks/useSmartRecovery.ts` | Reescribir con polling pattern |
| `src/components/dashboard/SmartRecoveryCard.tsx` | Mejorar UI de progreso |

---

## Resultado Esperado

1. **Inicia Recovery 60 días** → Función se auto-ejecuta en background
2. **Cierras la pestaña** → El proceso sigue en el servidor
3. **Recargas la página** → Ves el progreso actual automáticamente
4. **Error** → Mensaje claro, opción de reanudar
5. **Completado** → Resultados detallados con exportación CSV

---

## Beneficios

- **Resiliente**: El proceso no depende del navegador
- **En tiempo real**: UI actualizada cada 3 segundos
- **Recuperable**: Puedes reanudar después de errores
- **Seguro**: Validaciones para no abusar de la API de Stripe
- **Optimizado**: Batches pequeños (3) para evitar timeouts
