

# Plan: Limpieza VRP Premium - Eliminación del Diseño Arcoíris

## Diagnóstico Completo

Tras revisar exhaustivamente los 32+ archivos afectados, identifiqué **todos** los colores fuera de la paleta VRP.

### Estado de la Paleta VRP (Referencia)

| Elemento | Color Permitido | Uso |
|----------|-----------------|-----|
| ✅ Activo/Pagado | `bg-emerald-500/10 text-emerald-400 border-emerald-500/30` | Estados positivos |
| ⚠️ Pendiente/Alerta | `bg-amber-500/10 text-amber-400 border-amber-500/30` | Estados de advertencia |
| 🔴 Error/Deuda | `bg-red-500/10 text-red-400 border-red-500/30` | Estados negativos |
| ⚪ Neutro/Inactivo | `bg-zinc-800 text-zinc-400 border-zinc-700` | Default, marcas neutrales |
| 🔴 Acción Principal | `bg-primary` (#AA0601) | Botones CTA principales |

---

## Archivos a Modificar (Prioridad Alta → Baja)

### 1. MÓDULO FINANZAS

#### ClientsTable.tsx - Ya Cumple ✅
```
Estado: Los badges de lifecycle ya usan paleta semántica correcta
- LEAD: bg-zinc-800 text-zinc-400 ✅
- CUSTOMER: bg-emerald-500/10 text-emerald-400 ✅
- CHURN: bg-red-500/10 text-red-400 ✅
```

**Sin cambios necesarios** - Ya está alineado con VRP.

---

#### InvoicesPage.tsx - Requiere Correcciones Menores
**Problema**: Usa colores de marca (blue, gray) en algunos lugares.

```text
Línea 181: 'open': 'bg-blue-500/10 text-blue-400 border-blue-500/30'
Línea 182: 'pending': 'bg-blue-500/10 text-blue-400 border-blue-500/30'
Línea 180: 'draft': 'bg-gray-500/10 text-gray-400 border-gray-500/30'
```

**Corrección**:
```typescript
const styles: Record<string, string> = {
  draft: 'bg-zinc-800 text-zinc-400 border-zinc-700',           // Neutro
  open: 'bg-amber-500/10 text-amber-400 border-amber-500/30',   // Pendiente = Amber
  pending: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  paid: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  void: 'bg-red-500/10 text-red-400 border-red-500/30',
  uncollectible: 'bg-red-500/10 text-red-400 border-red-500/30', // Error, no amber
  failed: 'bg-red-500/10 text-red-400 border-red-500/30',
};
```

---

#### SubscriptionsPage.tsx - Requiere Correcciones
**Problema**: Usa `purple` para trials y gradiente multicolor.

```text
Línea 59: { label: 'Trials', color: 'purple' }
Línea 238: bg-purple-500/10 text-purple-400 border-purple-500/30 (plan badge)
Línea 299: bg-gradient-to-r from-purple-500 to-emerald-500 (revenue bar)
```

**Corrección**:
```typescript
// Trials → Amber (pendiente/por convertir)
{ label: 'Trials', value: funnel.trials, icon: Clock, color: 'amber' }

// Plan badge → Neutro
<Badge variant="outline" className="bg-zinc-800 text-zinc-400 border-zinc-700">

// Revenue bar → Monocromático con acento rojo
<div className="h-full bg-primary" style={{ width: `${plan.percentage}%` }} />
```

---

### 2. MÓDULO DASHBOARD

#### DashboardHome.tsx - Requiere Correcciones Importantes
**Problema**: KPIs usan colores semánticos innecesarios (cyan, blue, purple, green).

```text
Línea 353: color: 'cyan' (Nuevos)
Línea 358: color: 'blue' (Trials)
Línea 364: color: 'purple' (Trial→Paid)
Línea 370: color: 'green' (Renovaciones)
```

**Corrección** - Todas las KPIs no-críticas usan neutral:
```typescript
const cards = [
  { title: 'MRR', color: 'primary', ... },       // Highlight → VRP Red
  { title: 'Ventas Netas', color: 'neutral', ... },
  { title: 'Nuevos', color: 'neutral', ... },
  { title: 'Trials', color: 'neutral', ... },
  { title: 'Trial→Paid', color: 'neutral', ... },
  { title: 'Renovaciones', color: 'neutral', ... },
  { title: 'En Riesgo', color: 'red', isNegative: true, ... },
  { title: 'Cancelaciones', color: 'amber', isNegative: true, ... },
];

const getColorClasses = (color: string, isNegative?: boolean) => {
  if (color === 'red' || isNegative) {
    return { bg: 'bg-red-500/10', text: 'text-red-400', icon: 'text-red-500', border: 'border-red-500/30' };
  }
  if (color === 'amber') {
    return { bg: 'bg-amber-500/10', text: 'text-amber-400', icon: 'text-amber-500', border: 'border-amber-500/30' };
  }
  if (color === 'primary') {
    return { bg: 'bg-primary/10', text: 'text-primary', icon: 'text-primary', border: 'border-primary/30' };
  }
  // DEFAULT: Neutral zinc
  return { bg: 'bg-zinc-800', text: 'text-foreground', icon: 'text-zinc-400', border: 'border-zinc-700' };
};
```

---

### 3. MÓDULO COMUNICACIÓN

#### MessagesPage.tsx - Requiere Correcciones
**Problema**: Channel selector usa colores de marca.

```text
Línea 517: bg-green-600 hover:bg-green-700 (WhatsApp)
Línea 531: bg-blue-600 hover:bg-blue-700 (SMS)
Línea 545: bg-purple-600 hover:bg-purple-700 (Native)
Línea 314: bg-green-100 text-green-700 (Window badge - light mode!)
```

**Corrección**:
```typescript
// Todos los canales → VRP Red cuando activo
<Button
  className={cn(
    "gap-1 h-7 text-xs px-2 md:px-3",
    selectedChannel === "whatsapp" && "bg-primary hover:bg-primary/90"
  )}
/>

// Window badge → Emerald sutil (es estado "activo")
<Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
```

#### CampaignControlCenter.tsx - Ya Cumple ✅
```
Línea 115-119: Todos los canales usan bg-zinc-800 text-white ✅
```

---

### 4. MÓDULO SISTEMA

#### SyncCenter.tsx - Requiere Correcciones
**Problema**: Estados de sync usan colores variados.

```text
Línea 231: bg-blue-500/20 text-blue-400 (running)
Línea 235: bg-yellow-500/20 text-yellow-400 (partial)
Línea 423: text-blue-400 (updated count)
Línea 424: text-yellow-400 (conflicts count)
```

**Corrección**:
```typescript
case 'running':
  return <Badge className="bg-zinc-800 text-white"><Loader2 className="animate-spin" /> En progreso</Badge>;
case 'partial':
  return <Badge className="bg-amber-500/20 text-amber-400"> Parcial</Badge>;

// Counts → Neutro
<TableCell className="text-right text-zinc-400">{run.total_updated}</TableCell>
<TableCell className="text-right text-amber-400">{run.total_conflicts}</TableCell> // Amber = warning
```

---

#### RecoveryPage.tsx - Requiere Correcciones
**Problema**: Source badges y botones de acción usan colores de marca.

```text
Línea 490: bg-purple-500/10 text-purple-400 (source badge)
Línea 518: bg-blue-500/15 text-blue-400 (SMS button)
Línea 652: bg-purple-500/10 text-purple-400 (source badge desktop)
Línea 713: border-blue-500/30 text-blue-400 (SMS dropdown button)
```

**Corrección**:
```typescript
// Source badges → Neutro
<Badge variant="outline" className="bg-zinc-800 text-white border-zinc-700">
  {client.source}
</Badge>

// SMS buttons → Outline neutro o Secondary
<Button variant="secondary" className="gap-1.5">
  <Phone className="h-4 w-4" />
  SMS
</Button>
```

---

#### ClientEventsTimeline.tsx - Requiere Correcciones
**Problema**: Eventos usan colores de marca.

```text
Línea 40: text-blue-400 (email_open)
Línea 46: text-purple-400 (high_usage)
Línea 47: text-blue-400 (trial_started)
```

**Corrección**:
```typescript
const eventConfig = {
  email_open: { color: "text-zinc-400" },      // Neutro
  email_click: { color: "text-zinc-400" },     // Neutro
  email_bounce: { color: "text-red-400" },     // Error
  payment_failed: { color: "text-red-400" },   // Error
  payment_success: { color: "text-emerald-400" }, // Éxito
  high_usage: { color: "text-zinc-400" },      // Neutro
  trial_started: { color: "text-amber-400" },  // Pendiente/En proceso
  trial_converted: { color: "text-emerald-400" }, // Éxito
  churn_risk: { color: "text-amber-400" },     // Advertencia
};
```

---

#### DiagnosticsPanel.tsx - Ya Cumple ✅
```
Línea 85-98: Ya usa paleta semántica correcta ✅
- ok/completed: emerald
- warning: amber
- critical/error: red
- neutral: zinc
```

---

#### BotChatPage.tsx - Requiere Correcciones
**Problema**: Avatar de usuario usa blue.

```text
Línea 490: bg-blue-100 text-blue-600 (user avatar)
```

**Corrección**:
```typescript
<AvatarFallback className="bg-primary/20 text-primary text-xs">
  <User className="h-3.5 w-3.5" />
</AvatarFallback>
```

---

## Resumen de Cambios

| Archivo | Tipo de Cambio | Prioridad |
|---------|----------------|-----------|
| InvoicesPage.tsx | Neutralizar badges open/draft | Alta |
| SubscriptionsPage.tsx | Eliminar purple, simplificar colores | Alta |
| DashboardHome.tsx | Neutralizar KPIs no-críticos | Alta |
| MessagesPage.tsx | Canal selector → VRP Red | Alta |
| SyncCenter.tsx | Neutralizar estados de sync | Media |
| RecoveryPage.tsx | Neutralizar source badges y SMS buttons | Media |
| ClientEventsTimeline.tsx | Mapear eventos a paleta semántica | Media |
| BotChatPage.tsx | Cambiar avatar color | Baja |

---

## Resultado Visual Final

```text
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  🎨 PALETA VRP PREMIUM - APLICACIÓN COMPLETA                        │
│  ─────────────────────────────────────────────────────────────────   │
│                                                                      │
│  ┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────┐│
│  │ 🟤 Zinc-950         │ │ ⬜ Zinc-900 (Cards) │ │ 🔴 VRP Red      ││
│  │ Fondo principal     │ │ Elevación sutil     │ │ Solo acciones   ││
│  │ #09090b             │ │ #18181b             │ │ #AA0601         ││
│  └─────────────────────┘ └─────────────────────┘ └─────────────────┘│
│                                                                      │
│  Estados Semánticos:                                                 │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ ✅ Emerald  │ │ ⚠️ Amber    │ │ 🔴 Red      │ │ ⚪ Zinc     │   │
│  │ Activo/OK   │ │ Pendiente   │ │ Error/Deuda │ │ Neutro/Def  │   │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘   │
│                                                                      │
│  ❌ PROHIBIDO: blue, purple, cyan, green-600, yellow, orange        │
│  ✅ PERMITIDO: emerald-400, amber-400, red-400, zinc-400            │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Sección Técnica

### Estrategia de Cambio

1. **Buscar y Reemplazar Global**:
   - `bg-blue-500/10` → `bg-amber-500/10` (para estados pending)
   - `text-blue-400` → `text-amber-400` (o `text-zinc-400` si es neutro)
   - `bg-purple-500/10` → `bg-zinc-800`
   - `text-purple-400` → `text-zinc-400`
   - `bg-green-600` → `bg-primary`
   - `bg-blue-600` → `bg-primary`

2. **Validar cada archivo** que tenga reglas específicas de estado (ok/error/warning).

3. **Los únicos colores permitidos fuera de zinc**:
   - `emerald-400/500` → Solo para estados "exitoso", "activo", "pagado"
   - `amber-400/500` → Solo para estados "pendiente", "advertencia", "en proceso"
   - `red-400/500` → Solo para estados "error", "deuda", "fallido", "cancelado"
   - `primary` (#AA0601) → Solo para botones de acción y acentos

### Impacto

- **13 archivos** requieren modificación
- **~80 líneas** de cambios de color
- **0 cambios de lógica** - Solo CSS/clases

