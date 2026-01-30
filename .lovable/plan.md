

## Plan de Recuperación de Emergencia: Base de Datos Saturada

### 🔴 Diagnóstico del Problema Real

He identificado la **causa raíz** del bucle infinito que está manteniendo la base de datos saturada:

1. **Webhooks de GHL llegando cada ~2 minutos** - El mismo contacto (`VvN9SZuIhSmXeX4QJ65D`) está enviando webhooks repetidamente
2. **Cada webhook falla** porque la base de datos no responde (timeout)
3. **El webhook intenta recuperarse** con RPC en background → también falla
4. **GHL reintenta** → ciclo infinito

Este ciclo mantiene la base de datos ocupada intentando procesar requests que nunca terminan, creando un bloqueo circular.

### 📊 Estado Actual de la Base de Datos

| Tabla | Filas | Tamaño | Tipo |
|-------|-------|--------|------|
| csv_imports_raw | 663,660 | 613 MB | Staging (temporal) |
| ghl_contacts_raw | 188,325 | 317 MB | Staging (temporal) |
| merge_conflicts | 39,501 | 55 MB | Staging (temporal) |
| webhook_events | 11,160 | 26 MB | Logs (temporal) |
| **Total Staging** | **~900k** | **~1 GB** | ⚠️ Basura |
| | | | |
| clients | 221,275 | 175 MB | Datos reales ✓ |
| transactions | 206,817 | 366 MB | Datos reales ✓ |
| invoices | 79,811 | 314 MB | Datos reales ✓ |

---

### 🛠️ Plan de Ejecución (2 Fases)

#### **FASE 1: Detener el Sangrado** (Inmediato)

Modificar el webhook de GHL para que **no haga NADA** cuando la base de datos esté saturada - solo responder 200 OK inmediatamente:

```text
┌─────────────────┐
│  GHL Webhook    │
│    llega        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     NO
│ ¿DB disponible? │────────► Responder 200 OK
│  (ping rápido)  │          (sin procesar)
└────────┬────────┘
         │ SÍ
         ▼
┌─────────────────┐
│ Procesar normal │
└─────────────────┘
```

**Cambios específicos:**
- Agregar un "circuit breaker" al inicio del webhook
- Hacer un ping simple (`SELECT 1`) con timeout de 2 segundos
- Si falla → responder 200 OK inmediatamente sin intentar nada más
- Eliminar el fallback de RPC en background (está causando más carga)

#### **FASE 2: Limpieza Masiva** (Después de estabilizar)

Una vez que el webhook deje de agregar carga, ejecutar migraciones para:

1. **Truncar tablas de staging** (liberará ~1GB):
   - `TRUNCATE TABLE csv_imports_raw`
   - `TRUNCATE TABLE ghl_contacts_raw` 
   - `TRUNCATE TABLE merge_conflicts`
   - `DELETE FROM webhook_events WHERE created_at < NOW() - INTERVAL '7 days'`

2. **Ejecutar VACUUM** para recuperar espacio:
   - `VACUUM ANALYZE csv_imports_raw`
   - `VACUUM ANALYZE ghl_contacts_raw`

3. **Agregar limpieza automática** - Crear un job que limpie staging cada noche

---

### ⚠️ Sobre Conectar a Supabase Externo

Lamentablemente, **no es posible** conectar Lovable Cloud a un proyecto Supabase externo. El archivo `src/integrations/supabase/client.ts` está marcado como auto-generado y cualquier cambio se sobrescribe automáticamente.

Las opciones reales son:
1. ✅ **Recuperar esta base** (lo que vamos a hacer)
2. ⚠️ Crear un proyecto Lovable nuevo y migrar datos manualmente (última opción)

---

### 📝 Detalles Técnicos

**Archivo a modificar:** `supabase/functions/ghl-webhook/index.ts`

Los cambios incluyen:
- Agregar función `checkDatabaseHealth()` con timeout de 2 segundos
- Retornar inmediatamente si la base no responde
- Eliminar el `EdgeRuntime.waitUntil` que intenta RPC en background
- Log claro de cuándo se está en "modo de protección"

**Migraciones a crear:**
- Migration para `TRUNCATE` de tablas staging
- Migration para crear función de limpieza automática con `pg_cron`

---

### 🎯 Resultado Esperado

Después de implementar:
1. Los webhooks de GHL responderán en <100ms (sin tocar la DB)
2. La base de datos tendrá tiempo de recuperarse
3. Una vez estable, la limpieza liberará ~1GB de espacio
4. La autenticación volverá a funcionar
5. Job automático prevendrá que esto vuelva a pasar

