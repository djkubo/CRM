
# Plan: Hacer Visible el Historial de Sincronización

## Resumen Ejecutivo
El componente `SyncResultsPanel` ya existe y es completamente funcional - tiene su propia lógica para consultar la tabla `sync_runs`, mostrar sincronizaciones activas con progreso en tiempo real, y listar las ejecuciones recientes con sus resultados. Sin embargo, NO está siendo renderizado en `ImportSyncPage.tsx`.

La solución es simple: importar y renderizar el componente.

---

## Análisis del Componente SyncResultsPanel

### Características Actuales
- Auto-contenido (no requiere props)
- Polling automático cada 5 segundos a `sync_runs`
- Suscripción a cambios en tiempo real via Supabase Realtime
- Muestra sincronizaciones activas con:
  - Barra de progreso animada
  - Tiempo transcurrido
  - Contador de registros procesados
  - Botón "Cancelar todo"
- Muestra historial reciente (última hora) con:
  - Estado (OK, Con errores, Error)
  - Duración total
  - Registros sincronizados/nuevos
  - Mensajes de error si los hay
- Se oculta automáticamente si no hay syncs activos ni recientes

---

## Cambio a Implementar

### Archivo: `src/components/dashboard/ImportSyncPage.tsx`

**1. Agregar importación** (línea 9):
```typescript
import { SyncResultsPanel } from './SyncResultsPanel';
```

**2. Renderizar el componente** después del header y antes de los Tabs:
```typescript
{/* Sync Status - Always visible */}
<SyncResultsPanel />
```

---

## Ubicación del Componente

```text
┌─────────────────────────────────────────────────────────────────────┐
│  📥 Importar / Sincronizar                                          │
│  Importa datos por CSV o sincroniza desde APIs                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  🔄 Estado de Sincronización          [Cancelar todo]       │   │
│  │  ───────────────────────────────────────────────────────────│   │
│  │  En progreso:                                               │   │
│  │    💳 Stripe    ⏱ 2m 34s • 1,245 registros  ⟳              │   │
│  │    ███████████████████░░░░░░░░░░░░░ 65%                     │   │
│  │                                                              │   │
│  │  Recientes:                                                  │   │
│  │    💳 PayPal     15:32 • 45s    892 (12 nuevos)    ✅ OK    │   │
│  │    📄 Facturas   15:28 • 2m     3,421 (0 nuevos)   ✅ OK    │   │
│  │    👥 ManyChat   15:15 • 1m 23s 567 (45 nuevos)    ⚠️ Error│   │
│  │                                                              │   │
│  │  ManyChat: Rate limit exceeded, retrying in 60s              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐     │
│  │  API Sync    │     CSV      │   Recovery   │   Unificar   │     │
│  └──────────────┴──────────────┴──────────────┴──────────────┘     │
│                                                                     │
│  [Contenido del tab seleccionado...]                                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Código Final

```typescript
import { useState } from 'react';
import { Upload, RefreshCw, FileText, Database, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CSVUploader } from './CSVUploader';
import { APISyncPanel } from './APISyncPanel';
import { SmartRecoveryCard } from './SmartRecoveryCard';
import { SyncOrchestrator } from './SyncOrchestrator';
import { SyncResultsPanel } from './SyncResultsPanel';  // ← NUEVO
import { useQueryClient } from '@tanstack/react-query';

export function ImportSyncPage() {
  const queryClient = useQueryClient();

  const handleProcessingComplete = () => {
    // ... existing code ...
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        {/* ... existing header ... */}
      </div>

      {/* Sync Status Panel - Shows active and recent syncs */}
      <SyncResultsPanel />  {/* ← NUEVO */}

      <Tabs defaultValue="api" className="space-y-4 sm:space-y-6">
        {/* ... existing tabs ... */}
      </Tabs>
    </div>
  );
}
```

---

## Comportamiento Esperado

| Escenario | Resultado |
|-----------|-----------|
| Hay sync activo | Panel visible con progreso en tiempo real |
| Hay syncs recientes (última hora) | Panel visible con historial |
| No hay syncs activos ni recientes | Panel se oculta automáticamente |
| Usuario recarga página | Ve estado actual de sincronizaciones |
| Sync termina mientras usuario mira | Se actualiza automáticamente (realtime) |

---

## Archivo a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/dashboard/ImportSyncPage.tsx` | + import SyncResultsPanel, + renderizar antes de Tabs |

---

## Testing Post-Implementación

1. Navegar a la página "Importar / Sincronizar"
2. Verificar que aparece el panel "Estado de Sincronización" si hay syncs recientes
3. Iniciar una sincronización (ej: Stripe) y verificar que aparece con progreso
4. Esperar a que termine y confirmar que aparece en historial con resultado
5. Si hubo errores, verificar que se muestra el mensaje de error
