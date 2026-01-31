
# Plan: Arreglar Modales Atascados y CORS de Reconcile

## Diagnóstico Confirmado

### Problema 1: Error CORS en `reconcile-metrics` (Diagnostics)
- **Causa**: La Edge Function ya tiene el código correcto con `https://zen-admin-joy.lovable.app`, pero los cambios NO están desplegados en Supabase
- **Solución**: Desplegar manualmente la Edge Function

### Problema 2: Modales "atascados" en Settings (ManyChat y GHL)  
- **Causa**: El panel de "Probar Conexión" llama a `sync-ghl` y `sync-manychat` que ejecutan sincronizaciones completas (pueden tardar minutos)
- **Lo que debería pasar**: Una prueba de conexión solo debería verificar que la API responde, no sincronizar datos

---

## Fase 1: Desplegar Edge Functions (Acción Inmediata)

Ejecutar deploy de las 4 Edge Functions con CORS corregido:
1. `reconcile-metrics`
2. `create-portal-session`
3. `force-charge-invoice`
4. `sync-clients`

---

## Fase 2: Crear Modo "Test Only" para GHL y ManyChat

### Cambios en `supabase/functions/sync-ghl/index.ts`:
Agregar parámetro `testOnly: true` que solo hace un ping a la API sin sincronizar:

```typescript
// Al inicio de Deno.serve, después de parsear body:
if (body?.testOnly) {
  // Solo verificar que la API responde
  const testResponse = await fetch(
    `https://services.leadconnectorhq.com/locations/${ghlLocationId}`,
    { headers: { 'Authorization': `Bearer ${ghlApiKey}`, 'Version': '2021-07-28' } }
  );
  
  return new Response(JSON.stringify({
    ok: testResponse.ok,
    success: testResponse.ok,
    status: testResponse.ok ? 'connected' : 'error',
    error: testResponse.ok ? null : `API returned ${testResponse.status}`
  }), { headers: corsHeaders });
}
```

### Cambios en `supabase/functions/sync-manychat/index.ts`:
Agregar el mismo parámetro `testOnly`:

```typescript
if (body?.testOnly) {
  // Verificar API key con endpoint de info
  const testResponse = await fetch(
    'https://api.manychat.com/fb/page/getInfo',
    { headers: { 'Authorization': `Bearer ${manychatApiKey}` } }
  );
  
  return new Response(JSON.stringify({
    ok: testResponse.ok,
    success: testResponse.ok,
    status: testResponse.ok ? 'connected' : 'error',
    error: testResponse.ok ? null : `API returned ${testResponse.status}`
  }), { headers: corsHeaders });
}
```

---

## Fase 3: Actualizar IntegrationsStatusPanel

### Archivo: `src/components/dashboard/IntegrationsStatusPanel.tsx`

Cambiar el payload de prueba de conexión:

```typescript
// ANTES
const result = await invokeWithAdminKey<...>(
  integration.testEndpoint,
  { dryRun: true, limit: 1 }  // ❌ Esto ejecuta un sync completo
);

// DESPUÉS  
const result = await invokeWithAdminKey<...>(
  integration.testEndpoint,
  { testOnly: true }  // ✅ Solo verifica la conexión
);
```

---

## Resumen de Cambios

| Archivo | Cambio |
|---------|--------|
| Edge Functions (deploy) | Desplegar las 4 funciones con CORS actualizado |
| `sync-ghl/index.ts` | Agregar modo `testOnly` para health check rápido |
| `sync-manychat/index.ts` | Agregar modo `testOnly` para health check rápido |
| `IntegrationsStatusPanel.tsx` | Cambiar `{ dryRun, limit }` a `{ testOnly: true }` |

---

## Resultado Esperado
- **Diagnostics**: Reconciliación funcionará desde producción (CORS arreglado)
- **Settings**: Probar conexión será instantáneo (~1 segundo) en vez de minutos
- **No más modales atascados**: El timeout de 30s casi nunca se activará porque los tests serán rápidos

---

## Detalles Técnicos del Modo testOnly

```text
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO ACTUAL (Lento)                         │
├─────────────────────────────────────────────────────────────────┤
│ Click "Probar"  →  sync-ghl  →  Crear sync_run  →  Fetch 100   │
│   conexión           │           en DB             contactos    │
│                      │                                │         │
│                      ↓                                ↓         │
│               Respuesta después de 10-60 segundos              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO NUEVO (Rápido)                         │
├─────────────────────────────────────────────────────────────────┤
│ Click "Probar"  →  sync-ghl  →  Ping API  →  Respuesta         │
│   conexión         testOnly       solo       en <2 segundos     │
│                      │                                          │
│                      ↓                                          │
│               NO toca la base de datos                         │
└─────────────────────────────────────────────────────────────────┘
```
