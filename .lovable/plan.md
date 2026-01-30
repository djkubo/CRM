

# Plan de Recuperación Completa de Datos

## Estado Actual del Sistema

| Tabla | Registros | Estado |
|-------|-----------|--------|
| `transactions` | 164,827 | ✅ Stripe: 108k, PayPal: 38k, Web: 18k |
| `clients` | 221,276 | ✅ Base sólida |
| `ghl_contacts_raw` | 8 | ⚠️ Casi vacío - necesita sync |
| `manychat_contacts_raw` | 0 | ❌ Vacío - necesita sync |
| `csv_imports_raw` | 0 | ✅ Ya unificado |

**Última sincronización PayPal:** 27 enero (faltan 3 días)
**Última sincronización Stripe:** 29 enero (reciente)

---

## Flujo de Ejecución Recomendado

```text
┌─────────────────────────────────────────────────────────────┐
│  FASE 1: DESCARGAR DATOS (Staging)                          │
├─────────────────────────────────────────────────────────────┤
│  1.1 Stripe → Historial Completo (si hay gaps)              │
│  1.2 PayPal → Últimos 7 días (actualizar)                   │
│  1.3 GHL → Todo el historial                                │
│  1.4 ManyChat → Todo el historial                           │
│      ⏱️ Esperar que cada uno termine antes del siguiente    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  FASE 2: UNIFICAR IDENTIDADES                               │
├─────────────────────────────────────────────────────────────┤
│  2.1 Ejecutar "Unify All Sources"                           │
│      → Merge GHL raw → clients                              │
│      → Merge ManyChat raw → clients                         │
│      → Enriquecer perfiles con datos de pago                │
│      ⏱️ Proceso largo (~30 min para 200k+ registros)        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  FASE 3: LIMPIEZA AUTOMÁTICA                                │
├─────────────────────────────────────────────────────────────┤
│  3.1 Ejecutar cleanup_old_data()                            │
│      → Elimina staging > 30 días                            │
│      → Elimina sync_runs > 14 días                          │
│      → Libera espacio en disco                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Pasos Detallados

### Paso 1: Actualizar PayPal (7 días)
- **Por qué:** Última transacción fue el 27 enero, faltan 3 días de datos
- **Acción:** Sync Center → PayPal → 7 días
- **Tiempo estimado:** 2-5 minutos

### Paso 2: Sincronizar GHL (Todo el historial)
- **Por qué:** Solo hay 8 registros en staging, probablemente falló
- **Acción:** Sync Center → GHL → "Todo el historial"
- **Tiempo estimado:** 10-30 minutos dependiendo del volumen
- **⚠️ Nota:** Si da error 429 (Too Many Requests), esperar 5 min y reintentar

### Paso 3: Sincronizar ManyChat
- **Por qué:** Tabla vacía, necesita todos los suscriptores
- **Acción:** Sync Center → ManyChat → Sincronizar
- **Tiempo estimado:** 5-15 minutos

### Paso 4: Unificar Todo
- **Por qué:** Consolidar todas las fuentes en `clients`
- **Acción:** Sync Center → "Unify All Sources"
- **Tiempo estimado:** 20-45 minutos para ~200k registros
- **✅ Auto-continúa:** El proceso se encadena automáticamente

### Paso 5: Limpieza Final
- **Por qué:** Liberar espacio después de procesar
- **Acción:** Ejecutar `SELECT cleanup_old_data();` desde settings o esperar cron
- **Resultado:** Elimina datos de staging ya procesados

---

## Mejoras al Sistema (Implementación)

Para facilitar este flujo, propongo agregar un **Panel de Recuperación Guiada** en el Sync Center:

### Componentes a Crear

**1. Botones de Acción Rápida en SyncOrchestrator**
- "Recuperación Completa" - Ejecuta todo el flujo secuencialmente
- Indicador de progreso por fase
- Log de actividad en tiempo real

**2. Cola de Sincronización Inteligente**
- Encolar syncs en orden
- Esperar que uno termine antes de iniciar el siguiente
- Manejar errores con retry automático

### Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/dashboard/SyncOrchestrator.tsx` | Agregar botón "Recuperación Completa" |
| `src/hooks/useSyncQueue.ts` | Nuevo hook para manejar cola de syncs |

---

## Resumen Visual del Flujo

```text
 ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
 │  PayPal  │───▶│   GHL    │───▶│ ManyChat │───▶│  Unify   │
 │  7 días  │    │ Historial│    │ Historial│    │   All    │
 └──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                       │
                                                       ▼
                                                 ┌──────────┐
                                                 │ Cleanup  │
                                                 │  Datos   │
                                                 └──────────┘
```

---

## Acción Inmediata

¿Quieres que implemente los botones de acción rápida en el Sync Center para ejecutar este flujo de forma guiada?

