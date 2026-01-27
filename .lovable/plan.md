
# Plan: Agregar Acceso al Botón "Unificar Todo"

## Problema Detectado

El botón **"Unificar Todo"** existe en el componente `SyncOrchestrator`, pero este componente **NO está montado en ninguna vista accesible**:

| Componente | Acceso | Funcionalidad |
|------------|--------|---------------|
| `ImportSyncPage` | Sidebar → "Importar/Sync" | Solo API Sync, CSV, Recovery |
| `SyncCenter` | N/A (no en sidebar) | Historial de syncs, conflictos |
| `SyncOrchestrator` | **❌ NINGUNO** | Botón "Unificar Todo" |

## Solución Propuesta

Agregar el `SyncOrchestrator` como una pestaña nueva en `ImportSyncPage` para que el botón de unificación sea accesible.

## Cambios

### Archivo: `src/components/dashboard/ImportSyncPage.tsx`

1. Importar `SyncOrchestrator`
2. Agregar nueva pestaña "Unificar" con icono de Users
3. Renderizar `SyncOrchestrator` dentro de esa pestaña

```typescript
import { SyncOrchestrator } from './SyncOrchestrator';
// ...

<TabsTrigger value="unify" className="gap-1.5 sm:gap-2">
  <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
  Unificar
</TabsTrigger>

<TabsContent value="unify">
  <SyncOrchestrator />
</TabsContent>
```

## Resultado

El usuario podrá:
1. Ir a **Sidebar → "Importar/Sync"**
2. Hacer click en la pestaña **"Unificar"**
3. Ver el panel de Fase 1 (Descargar) y Fase 2 (Unificar)
4. Presionar el botón **"Unificar Todo (XXX registros)"**

## Flujo Visual

```text
┌──────────────────────────────────────────────────────────────┐
│  SIDEBAR                                                      │
├──────────────────────────────────────────────────────────────┤
│  ▸ Command Center                                             │
│  ▸ Movimientos                                                │
│  ▸ ...                                                        │
│  ▸ Importar/Sync  ← CLICK AQUÍ                               │
└──────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  [ API Sync ] [ CSV ] [ Recovery ] [ Unificar ]  ← NUEVA TAB │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   ┌────────────────────────────────────────────────────────┐ │
│   │  Fase 2: Unificar Identidades                          │ │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐                   │ │
│   │  │ GHL     │ │ManyChat │ │  CSV    │                   │ │
│   │  │188,100  │ │   0     │ │664,048  │                   │ │
│   │  └─────────┘ └─────────┘ └─────────┘                   │ │
│   │                                                        │ │
│   │  ┌────────────────────────────────────────────────┐   │ │
│   │  │  ▶ Unificar Todo (852,148 registros)           │   │ │
│   │  └────────────────────────────────────────────────┘   │ │
│   └────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/dashboard/ImportSyncPage.tsx` | Agregar tab "Unificar" con SyncOrchestrator |

## Detalles Técnicos

La modificación es simple:
- Agregar import de `SyncOrchestrator` y `Users` icon
- Agregar un nuevo `TabsTrigger` para "unify"
- Agregar un nuevo `TabsContent` que renderiza `<SyncOrchestrator />`
