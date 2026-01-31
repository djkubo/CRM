
# Plan: Desactivar Completamente GoHighLevel Hasta Reinicio Manual

## Diagnóstico Confirmado

**El webhook de GHL está activo y recibiendo datos constantemente:**
- Último contacto recibido: hace ~40 minutos
- 54 contactos pendientes de procesar en staging
- El webhook NO respeta el flag `sync_paused` de system_settings

**Los syncs manuales no están corriendo** (la base confirma 0 syncs activos), pero los webhooks de GHL siguen entrando.

---

## Fase 1: Agregar Kill Switch al Webhook de GHL (Emergencia)

### Archivo: `supabase/functions/ghl-webhook/index.ts`

Agregar verificación del flag `sync_paused` justo después del circuit breaker:

```typescript
// Después de la línea 242 (después del health check):

// =========================================================================
// KILL SWITCH - Verificar si GHL está pausado globalmente
// =========================================================================
const { data: pausedSetting } = await supabase
  .from('system_settings')
  .select('value')
  .eq('key', 'ghl_paused')
  .single();

if (pausedSetting?.value === 'true') {
  logger.info("🛑 GHL PAUSED - Webhook acknowledged but not processed", { requestId });
  return new Response(JSON.stringify({ 
    success: true, 
    action: "paused",
    message: "GHL integration is currently paused",
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

---

## Fase 2: Agregar Toggle Específico para GHL en la UI

### Archivo: `src/components/dashboard/SystemTogglesPanel.tsx`

Agregar nuevo toggle `ghl_paused`:

```typescript
interface SystemSettings {
  // ... existentes ...
  ghl_paused: boolean;  // NUEVO
}

// En el JSX, nuevo toggle:
<div className="flex items-center justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/30">
  <div className="flex items-center gap-3">
    <Pause className="h-5 w-5 text-destructive" />
    <div>
      <Label className="font-medium text-destructive">Pausar GoHighLevel</Label>
      <p className="text-xs text-muted-foreground">
        Detiene TODOS los webhooks y syncs de GHL
      </p>
    </div>
  </div>
  <Switch
    checked={settings.ghl_paused}
    onCheckedChange={(checked) => updateSetting('ghl_paused', checked)}
  />
</div>
```

---

## Fase 3: Acción Inmediata - Insertar Flag en DB

Ejecutar SQL para pausar GHL inmediatamente:

```sql
INSERT INTO system_settings (key, value, updated_at)
VALUES ('ghl_paused', 'true', NOW())
ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW();
```

---

## Resumen de Cambios

| Archivo/Acción | Descripción |
|----------------|-------------|
| **SQL Inmediato** | Insertar `ghl_paused = true` en system_settings |
| `ghl-webhook/index.ts` | Agregar verificación de `ghl_paused` antes de procesar |
| `SystemTogglesPanel.tsx` | Agregar toggle visual para pausar/reanudar GHL |
| **Desplegar** | Deploy de `ghl-webhook` con el kill switch |

---

## Resultado Esperado

1. **Inmediatamente** (después de insertar SQL): El flag existe pero el webhook viejo no lo lee
2. **Después del deploy**: El webhook leerá el flag y responderá 200 OK sin procesar nada
3. **Control manual**: Podrás activar/desactivar GHL desde Settings cuando quieras

---

## Diagrama del Flujo

```text
┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO ACTUAL (Sin control)                   │
├─────────────────────────────────────────────────────────────────┤
│ GHL envía webhook → Edge Function → Guarda en staging → 200 OK │
│                     (siempre procesa)                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    FLUJO NUEVO (Con kill switch)                │
├─────────────────────────────────────────────────────────────────┤
│ GHL envía webhook → Edge Function → ¿ghl_paused?               │
│                                        │                        │
│                          ┌─────────────┴─────────────┐          │
│                          ▼                           ▼          │
│                   [YES: paused]              [NO: activo]       │
│                          │                           │          │
│                   Responder 200 OK         Guardar en staging   │
│                   sin procesar nada              200 OK         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Para Reactivar GHL en el Futuro

Simplemente ir a **Settings → Configuración del Sistema** y desactivar el toggle "Pausar GoHighLevel", o ejecutar:

```sql
UPDATE system_settings SET value = 'false' WHERE key = 'ghl_paused';
```
