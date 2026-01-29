
# Plan: Rediseño Visual Estilo VRP (Stripe Dark Mode)

## Resumen del Problema

La página de "Importar / Sincronizar" tiene un **arcoíris de colores** que rompe la identidad visual:

| Elemento | Color Actual | Problema |
|----------|-------------|----------|
| Botón "Últimas 24h" | Verde esmeralda | Choca con VRP Red |
| Botón "Todo Historial" Stripe | Morado | Fuera de paleta |
| Botón "Todo Historial" PayPal | Amarillo | Fuera de paleta |
| Botón ManyChat | Azul | Fuera de paleta |
| Botón GHL | Verde | Fuera de paleta |
| Iconos de servicios | Colores variados | Sin consistencia |
| Barras de progreso | Colores por servicio | Sin unidad |

## Solución: Paleta Monocromática (Zinc + VRP Red)

### Reglas de Diseño Estrictas

```text
┌─────────────────────────────────────────────────────────────┐
│  JERARQUÍA DE COLORES VRP                                   │
├─────────────────────────────────────────────────────────────┤
│  1. Fondo General    → #09090b (zinc-950)                   │
│  2. Tarjetas         → #18181b (zinc-900) + border zinc-800 │
│  3. Botones Primarios→ #AA0601 (VRP Red) hover: #8a0501     │
│  4. Botones Secundarios → transparent + border-zinc-700     │
│  5. Texto Principal  → #fafafa (white)                      │
│  6. Texto Secundario → #71717a (zinc-500)                   │
│  7. Progress Bar     → track: zinc-800, fill: VRP Red       │
└─────────────────────────────────────────────────────────────┘
```

---

## Archivos a Modificar

### 1. `src/components/dashboard/APISyncPanel.tsx`

**Cambios principales:**

- **Stripe Card** (líneas 918-986):
  - Icono: cambiar `bg-purple-500/20` → `bg-zinc-800`
  - Botón "24h": eliminar `border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10` → `border-zinc-700 text-white hover:bg-zinc-800`
  - Botón "Todo Historial": eliminar `bg-purple-600 hover:bg-purple-700` → `bg-primary hover:bg-primary/90`

- **PayPal Card** (líneas 988-1057):
  - Icono: cambiar `bg-yellow-500/20` → `bg-zinc-800`
  - Botón "24h": eliminar colores verdes → usar zinc
  - Botón "Todo Historial": eliminar `bg-yellow-600 hover:bg-yellow-700` → `bg-primary hover:bg-primary/90`

- **Facturas Card** (líneas 1059-1113):
  - Borde: eliminar `border-cyan-500/30` → `border-zinc-800`
  - Icono: cambiar `bg-cyan-500/20` → `bg-zinc-800`
  - Botones: colores cyan → zinc/primary

- **ManyChat Card** (líneas 1115-1163):
  - Borde: eliminar `border-blue-500/30` → `border-zinc-800`
  - Botón: eliminar `bg-blue-600 hover:bg-blue-700` → `bg-primary hover:bg-primary/90`

- **GHL Card** (líneas 1165-1216):
  - Borde: eliminar `border-green-500/30` → `border-zinc-800`
  - Botón: eliminar `bg-green-600 hover:bg-green-700` → `bg-primary hover:bg-primary/90`

- **Sync All Button** (líneas 1218-1235):
  - Eliminar gradiente `from-purple-600 to-yellow-600` → `bg-primary hover:bg-primary/90`

- **Progress Indicators** (líneas 813-915):
  - Eliminar fondos de colores (purple, blue, cyan, pink, amber) → usar `bg-zinc-800/50 border-zinc-700`
  - Texto de estado: color neutro (white) en lugar de colores

### 2. `src/components/dashboard/ImportSyncPage.tsx`

**Cambios:**
- Icono del header: cambiar `text-cyan-500` → `text-primary` (línea 31)

### 3. `src/components/dashboard/SyncResultsPanel.tsx`

**Cambios:**
- SOURCE_CONFIG (líneas 52-61): Cambiar colores de iconos a zinc/white
- Badges de estado: Mantener verde para OK, rojo para Error (son informativos, no decorativos)
- Kill Switch button: Mantener color amber (es una advertencia)

### 4. `src/components/dashboard/SmartRecoveryCard.tsx`

**Cambios:**
- Ya usa paleta roja, solo ajustes menores en botones de rango
- Mantener rojo porque es la sección de "Recovery" (acción crítica)

### 5. `src/components/dashboard/SyncOrchestrator.tsx`

**Cambios principales:**
- Badges de estado (líneas 758-771): Cambiar azul/verde/naranja → tonos más neutros
- Cards de servicios (líneas 819-958): 
  - Botones de sync → `bg-primary` en lugar de colores específicos
- Progress bar → usar colores neutros

### 6. `src/components/ui/progress.tsx`

**Cambios:**
- Actualizar el indicador para usar el color VRP Red por defecto
- Track: `bg-zinc-800` (oscuro pero visible)
- Fill: `bg-primary` (VRP Red)

---

## Detalle de Cambios por Componente

### APISyncPanel.tsx - Botones Estandarizados

**Antes (ejemplo Stripe):**
```tsx
<Button className="gap-2 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10">
<Button className="gap-2 bg-purple-600 hover:bg-purple-700">
```

**Después:**
```tsx
<Button variant="outline" className="gap-2 border-zinc-700 text-white hover:bg-zinc-800">
<Button className="gap-2 bg-primary hover:bg-primary/90">
```

### APISyncPanel.tsx - Tarjetas de Servicios

**Antes:**
```tsx
<div className="p-4 bg-background rounded-lg border border-green-500/30 space-y-3">
  <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
```

**Después:**
```tsx
<div className="p-4 bg-card rounded-lg border border-zinc-800 space-y-3">
  <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
```

### Progress Indicators

**Antes:**
```tsx
<div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/30">
  <span className="text-purple-400">Stripe: ...</span>
```

**Después:**
```tsx
<div className="p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
  <span className="text-white">Stripe: ...</span>
```

### SyncOrchestrator.tsx - Cards de Fase 1

**Antes:**
```tsx
<Button className="w-full mt-2 bg-orange-500 hover:bg-orange-600">
```

**Después:**
```tsx
<Button className="w-full mt-2 bg-primary hover:bg-primary/90">
```

---

## Resultado Visual Esperado

```text
┌────────────────────────────────────────────────────────────────┐
│  IMPORTAR / SINCRONIZAR                         [zinc-950 bg]  │
├────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  [S]  Stripe                              [zinc-900 card] │  │
│  │       Sincroniza desde Stripe API                         │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐ │  │
│  │  │  24h     │ │  31 días │ │  6 meses │ │Todo Historial│ │  │
│  │  │[zinc-700]│ │[zinc-700]│ │[zinc-700]│ │ [VRP RED]    │ │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────┘ │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  [P]  PayPal                              [zinc-900 card] │  │
│  │       ... (mismo patrón)                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────────┐
│  │  Progress Bar: ████████████░░░░░░░░  [zinc-800 track]       │
│  │                [VRP RED fill]                                │
│  └──────────────────────────────────────────────────────────────┘
└────────────────────────────────────────────────────────────────┘
```

---

## Archivos a Modificar (Total: 5)

| Archivo | Cambios |
|---------|---------|
| `src/components/dashboard/APISyncPanel.tsx` | ~50 líneas de estilos de botones y cards |
| `src/components/dashboard/ImportSyncPage.tsx` | 1 línea (color del icono header) |
| `src/components/dashboard/SyncResultsPanel.tsx` | ~15 líneas (colores de iconos y badges) |
| `src/components/dashboard/SyncOrchestrator.tsx` | ~30 líneas (botones y badges) |
| `src/components/ui/progress.tsx` | 2 líneas (track y fill color) |

---

## Principios de la Solución

1. **Monocromático**: Solo zinc (grises) + VRP Red (#AA0601)
2. **Jerarquía clara**: Botones principales = VRP Red, secundarios = bordes zinc
3. **Profundidad**: Cards `bg-card` con `border-zinc-800` para separación
4. **Legibilidad**: Texto siempre blanco o zinc-500 (nunca colores)
5. **Consistencia**: Todos los servicios con el mismo tratamiento visual
