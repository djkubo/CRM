
# Plan: Arreglar Pruebas de Conexión que Inician Syncs Completos

## Diagnóstico Confirmado

El problema es claro: cuando el usuario hace click en "Probar Conexión" en la página de Settings, **las Edge Functions inician syncs completos en lugar de solo verificar la conexión**:

| Integración | ¿Tiene `testOnly`? | Comportamiento actual |
|-------------|--------------------|-----------------------|
| Stripe | ❌ NO | Inicia sync completo |
| PayPal | ❌ NO | Inicia sync completo |
| GoHighLevel | ✅ SÍ | Solo verifica conexión |
| ManyChat | ✅ SÍ | Solo verifica conexión |

## Fase 1: Agregar modo `testOnly` a Stripe

Modificar `supabase/functions/fetch-stripe/index.ts`:
- Detectar `body.testOnly === true` antes de cualquier sync
- Hacer un request mínimo a la API de Stripe (`GET /v1/balance`)
- Retornar inmediatamente con `{ ok: true, testOnly: true }`

## Fase 2: Agregar modo `testOnly` a PayPal

Modificar `supabase/functions/fetch-paypal/index.ts`:
- Detectar `body.testOnly === true` antes de cualquier sync
- Hacer un request mínimo a la API de PayPal (token endpoint o similar)
- Retornar inmediatamente con `{ ok: true, testOnly: true }`

## Fase 3: Agregar Kill Switch Global a Syncs Manuales

### Para `sync-ghl`:
- Agregar verificación de `system_settings.ghl_paused` al inicio del sync
- Si está pausado, retornar `{ ok: false, error: "GHL está pausado" }`

### Para `sync-manychat`:
- Agregar verificación de `system_settings.manychat_paused` (opcional, similar a GHL)

## Fase 4: Agregar Toggle ManyChat en UI (Opcional)

Agregar toggle `manychat_paused` similar al de GHL en `SystemTogglesPanel.tsx`

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/fetch-stripe/index.ts` | Agregar modo `testOnly` al inicio |
| `supabase/functions/fetch-paypal/index.ts` | Agregar modo `testOnly` al inicio |
| `supabase/functions/sync-ghl/index.ts` | Verificar `ghl_paused` antes de sync |
| `supabase/functions/sync-manychat/index.ts` | Verificar `manychat_paused` antes de sync (opcional) |
| `src/components/dashboard/SystemTogglesPanel.tsx` | Agregar toggle ManyChat (opcional) |

---

## Código de Ejemplo: testOnly para Stripe

```typescript
// Al inicio del handler, después de parsear el body:
if (body.testOnly === true) {
  logger.info('Test-only mode: Verifying Stripe API connection');
  try {
    const testResponse = await fetch('https://api.stripe.com/v1/balance', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    return new Response(JSON.stringify({
      ok: testResponse.ok,
      success: testResponse.ok,
      status: testResponse.ok ? 'connected' : 'error',
      apiStatus: testResponse.status,
      testOnly: true
    }), { status: 200, headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      success: false,
      error: error.message,
      testOnly: true
    }), { status: 200, headers: corsHeaders });
  }
}
```

---

## Resultado Esperado

1. **Probar Conexión** → Respuesta instantánea (<2 segundos)
2. **Sin syncs iniciados** por accidente
3. **Control total** con toggles de pausa para GHL y ManyChat
4. **SyncStatusBanner** no mostrará actividad cuando solo se prueba conexión
