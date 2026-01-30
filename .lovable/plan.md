
# Plan de Reescritura Maestra: VRP Dashboard Premium

## Diagnóstico del Estado Actual

Tras revisar exhaustivamente el código, identifiqué los siguientes problemas:

1. **Sistema de Diseño (index.css + tailwind.config.ts)**: La base de la paleta VRP está definida, pero faltan clases utilitarias globales (`.btn-primary`, `.card-base`, `.input-base`) que obliguen a todo el UI a seguir el estándar.

2. **Sidebar (Sidebar.tsx)**: Tiene una estructura plana con 15 items de menú sin agrupar, lo que genera confusión visual.

3. **ErrorBoundary + QueryClient**: Están correctamente configurados (retry max 2, ErrorBoundary envuelve toda la app). Solo necesitan mejoras menores de UX.

4. **Componentes UI**: Los componentes base (Button, Card, Input) usan correctamente las CSS variables. El problema está en componentes individuales que sobreescriben estilos con colores hardcodeados.

---

## Acciones a Ejecutar

### 1. Sistema de Diseño Global

**Archivo: `src/index.css`**

Se agregarán clases utilitarias globales en `@layer components` que estandaricen TODOS los elementos interactivos:

```text
┌─────────────────────────────────────────────────────────┐
│  NUEVAS CLASES GLOBALES                                 │
├─────────────────────────────────────────────────────────┤
│  .btn-primary    → VRP Red (#AA0601), hover 80%         │
│  .btn-secondary  → Zinc-800, borde sutil                │
│  .btn-ghost      → Transparente, hover zinc-800         │
│  .card-base      → bg-card, border-zinc-800, shadow     │
│  .input-base     → bg-zinc-900, focus ring VRP Red      │
│  .badge-neutral  → bg-zinc-800, text-zinc-300           │
│  .badge-success  → bg-emerald/10, text-emerald-400      │
│  .badge-warning  → bg-amber/10, text-amber-400          │
│  .badge-error    → bg-red/10, text-red-400              │
└─────────────────────────────────────────────────────────┘
```

Se eliminarán estilos legacy innecesarios (`.story-link`, gradientes, sombras agresivas).

**Archivo: `tailwind.config.ts`**

Se añadirán:
- Animaciones optimizadas (`fade-in`, `scale-in`, `pulse-soft`)
- Sombras premium (`shadow-soft`, `shadow-elevated`)
- Transiciones estandarizadas

### 2. Arquitectura de Navegación (Sidebar)

**Archivo: `src/components/dashboard/Sidebar.tsx`**

Reestructuración en 4 Módulos lógicos con íconos de sección:

```text
┌─────────────────────────────────────────────────────────┐
│  🏠 GENERAL                                             │
│  ├── Command Center                                     │
│  ├── Movimientos                                        │
│  └── Analytics                                          │
├─────────────────────────────────────────────────────────┤
│  💬 COMUNICACIÓN                                        │
│  ├── Mensajes                                           │
│  ├── Campañas                                           │
│  ├── Difusión                                           │
│  ├── Flows (Automatizaciones)                           │
│  └── WhatsApp Directo                                   │
├─────────────────────────────────────────────────────────┤
│  💰 FINANZAS                                            │
│  ├── Clientes                                           │
│  ├── Facturas                                           │
│  ├── Suscripciones                                      │
│  └── Recovery                                           │
├─────────────────────────────────────────────────────────┤
│  ⚙️ SISTEMA                                             │
│  ├── Importar / Sync                                    │
│  ├── Diagnostics                                        │
│  └── Ajustes                                            │
└─────────────────────────────────────────────────────────┘
```

Cambios visuales:
- Separadores sutiles entre grupos (`border-t border-zinc-800`)
- Labels de sección en `text-xs text-zinc-500 uppercase tracking-wide`
- Item activo: `bg-zinc-800 text-white` con indicador lateral VRP Red
- Hover state: `bg-zinc-800/50`

### 3. Controlador de Errores Global

**Archivo: `src/App.tsx`**

Mejoras al QueryClient:
- Confirmar que `retry: 2` está correctamente aplicado (ya está)
- Agregar `staleTime: 60000` global para reducir queries
- Configurar `refetchOnWindowFocus: false` para evitar saturación

**Archivo: `src/components/ErrorBoundary.tsx`**

Mejoras visuales:
- Estilo premium con paleta VRP
- Botón "Reintentar" con `btn-primary`
- Sección de debug solo en development
- Opción de "Ir al inicio" además de recargar

### 4. Estandarización de Componentes

Aplicar clases globales a componentes base existentes:

| Componente | Cambio |
|------------|--------|
| `button.tsx` | Ya usa CSS vars correctamente |
| `card.tsx` | Ya usa `bg-card border-border` |
| `input.tsx` | Cambiar a `input-base` explícito |
| `badge.tsx` | Agregar variantes `neutral`, `success`, `warning`, `error` |

---

## Archivos a Modificar

| Archivo | Acción |
|---------|--------|
| `src/index.css` | Agregar clases globales, limpiar legacy |
| `tailwind.config.ts` | Agregar animaciones y sombras |
| `src/components/dashboard/Sidebar.tsx` | Reestructurar en 4 módulos |
| `src/App.tsx` | Optimizar QueryClient |
| `src/components/ErrorBoundary.tsx` | Mejorar UX visual |
| `src/components/ui/badge.tsx` | Agregar variantes semánticas |

---

## Beneficios de Esta Arquitectura

1. **Consistencia Automática**: Cualquier nuevo componente que use `.btn-primary` o `.card-base` heredará automáticamente el estilo VRP.

2. **Mantenimiento Simplificado**: Cambiar el color primario en un solo lugar (`--primary`) actualiza TODA la app.

3. **Navegación Clara**: Los 4 módulos reducen la carga cognitiva y agrupan funcionalidades relacionadas.

4. **Resiliencia**: El ErrorBoundary mejorado + QueryClient optimizado evitan pantallas blancas y saturación de red.

5. **Performance**: Reducción de queries con `staleTime` y `refetchOnWindowFocus: false`.
