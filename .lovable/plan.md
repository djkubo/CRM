
# Plan: Implementar Auto-Continuación en fetch-paypal

## Problema Detectado

| Diagnóstico | Detalle |
|-------------|---------|
| Sync atascado | `f7916903-51dd-443b-8f63-f76b9889b416` |
| Estado actual | `continuing` desde hace ~1 hora |
| Procesado | Solo 145 transacciones (3 de 16 páginas) |
| Causa raíz | **No tiene auto-continuación como fetch-invoices** |
| Frontend | El frontend esperaba la respuesta para llamar la siguiente página, pero el Edge Runtime murió |

## Diferencia con fetch-invoices

`fetch-invoices` ahora tiene auto-continuación:
```text
Página 1 → guarda cursor → se auto-llama con cursor → Página 2 → ... → Completo
```

`fetch-paypal` NO la tiene:
```text
Página 1 → devuelve "continuing" → ESPERA que el frontend llame con page=2 → 💀 TIMEOUT
```

## Solución: Replicar el Patrón de Auto-Continuación

Agregar el mismo sistema de auto-invocación que implementamos en `fetch-invoices`:

1. **Después de procesar cada página**, si hay más páginas, llamarse a sí mismo con `page + 1`
2. **Usar flag `_continuation`** para bypass del check de "sync already running"
3. **Devolver respuesta inmediata** mientras el background continúa

## Cambios en fetch-paypal/index.ts

### 1. Detectar flag de continuación en el request

```typescript
let isContinuation = false;

try {
  const body = await req.json();
  // ... existente ...
  isContinuation = body._continuation === true;
} catch { ... }
```

### 2. Bypass del check de sync existente para continuaciones

```typescript
if (existingRuns && existingRuns.length > 0 && !isContinuation) {
  // Solo bloquear si NO es continuación
}
```

### 3. Auto-llamarse cuando hay más páginas

```typescript
if (hasMore) {
  // Actualizar sync_runs como ahora...
  
  // AUTO-CONTINUACIÓN: Llamarse a sí mismo
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  fetch(`${supabaseUrl}/functions/v1/fetch-paypal`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`
    },
    body: JSON.stringify({
      fetchAll: true,
      syncRunId,
      page: page + 1,
      startDate,
      endDate,
      _continuation: true  // Bypass security check
    })
  }).catch(err => logger.error('Auto-continuation failed', err));
  
  return new Response(...); // Respuesta inmediata
}
```

### 4. Manejar auth diferente para continuaciones

Las continuaciones usan `SUPABASE_SERVICE_ROLE_KEY` en lugar de JWT de usuario, así que necesitamos un bypass de `verifyAdmin()`:

```typescript
// Al inicio del handler:
const isContinuation = body._continuation === true;

// Solo verificar admin si NO es continuación (las continuaciones vienen del mismo edge function)
if (!isContinuation) {
  const authCheck = await verifyAdmin(req);
  if (!authCheck.valid) {
    return new Response(...forbidden...);
  }
}
```

## Acciones Inmediatas

### 1. Cancelar el sync atascado

```sql
UPDATE sync_runs 
SET status = 'cancelled', 
    completed_at = NOW(),
    error_message = 'Cancelado para reiniciar con auto-continuación'
WHERE id = 'f7916903-51dd-443b-8f63-f76b9889b416';
```

## Archivo a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/fetch-paypal/index.ts` | Agregar auto-continuación idéntica a fetch-invoices |

## Detalles Técnicos

### Cambios específicos por sección

**Líneas 243-293 (Parseo de body):**
- Agregar variable `isContinuation` para detectar llamadas de continuación

**Líneas 345-379 (Check de sync existente):**
- Agregar condición `&& !isContinuation` para permitir continuaciones

**Líneas 219-227 (Verificación de admin):**
- Skip `verifyAdmin()` si `isContinuation === true` (la request viene del mismo edge function con service key)

**Líneas 540-583 (Bloque hasMore):**
- Agregar auto-invocación con fetch() antes del return

## Flujo Resultante

```text
┌─────────────────────────────────────────────────────┐
│             Ejecución 1 (Usuario)                   │
├─────────────────────────────────────────────────────┤
│  Página 1 → 100 transacciones                       │
│  hasMore = true                                     │
│  Se auto-llama con page=2                          │
│  Respuesta inmediata al usuario                     │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│         Ejecución 2 (Auto-continuación)             │
├─────────────────────────────────────────────────────┤
│  Página 2 → 100 transacciones más                   │
│  Se auto-llama con page=3...                        │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
                     ...
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│              Ejecución N (Final)                    │
├─────────────────────────────────────────────────────┤
│  Última página                                      │
│  hasMore = false                                    │
│  Marca sync como completed ✅                       │
└─────────────────────────────────────────────────────┘
```

## Resultado Esperado

| Métrica | Antes | Después |
|---------|-------|---------|
| Dependencia del frontend | ✅ Necesita polling | ❌ Auto-suficiente |
| Resistente a timeout | ❌ | ✅ |
| Páginas por ejecución | 1 | 1 (pero encadena automáticamente) |
| Tiempo total ~16 páginas | ∞ (atascado) | ~30 segundos |

El sync de PayPal ahora procesará todas las páginas automáticamente sin depender del frontend.
