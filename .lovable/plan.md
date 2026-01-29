

# Plan: Rediseño Visual Completo - Estilo VRP (Todas las Secciones)

## Problema Detectado

Se aplicó el estilo VRP solo a `ImportSyncPage.tsx` y sus componentes relacionados. Sin embargo, **14+ páginas adicionales** siguen usando un arcoíris de colores inconsistentes:

| Sección | Colores Problemáticos |
|---------|----------------------|
| DashboardHome | Emerald, Cyan, Blue, Purple, Amber |
| ClientsPage | Emerald, Purple, Orange, Yellow, Red |
| ClientsTable | Emerald, Purple, Yellow, Orange |
| InvoicesPage | Blue, Cyan, Purple, PayPal blue |
| MovementsPage | Emerald, Indigo, Blue, Orange, Purple |
| MessagesPage | Blue, Green, Orange |
| RecoveryPage | Amber, Blue, Emerald, Red (gradientes) |
| SubscriptionsPage | Purple, Amber, Emerald, Red, Gray |
| CampaignControlCenter | Verde WhatsApp, Azul, Purple, Messenger Blue |
| AnalyticsPanel | Primary/5, gradientes |

---

## Reglas de Diseño VRP (Reiterar)

```text
┌─────────────────────────────────────────────────────────────┐
│  PALETA MONOCROMÁTICA VRP                                   │
├─────────────────────────────────────────────────────────────┤
│  1. Fondo General     → zinc-950 (#09090b)                  │
│  2. Tarjetas          → bg-card + border-zinc-800           │
│  3. Botones Primarios → bg-primary (VRP Red #AA0601)        │
│  4. Botones Secundarios → variant="outline" border-zinc-700 │
│  5. Texto Principal   → text-foreground (white)             │
│  6. Texto Secundario  → text-muted-foreground (zinc-500)    │
│  7. Progress/Indicadores → bg-primary                       │
│  8. Iconos Headers    → text-primary                        │
├─────────────────────────────────────────────────────────────┤
│  EXCEPCIONES SEMÁNTICAS (información, no decoración):       │
│  • Verde SOLO para: "Exitoso", "Pagado", "Activo"           │
│  • Rojo SOLO para: "Error", "Fallido", "Riesgo"             │
│  • Amber SOLO para: "Advertencia", "Pendiente"              │
│  • NO usar colores por servicio (Stripe≠morado, PayPal≠azul)│
└─────────────────────────────────────────────────────────────┘
```

---

## Archivos a Modificar (16 archivos)

### Grupo 1: Páginas Principales (8 archivos)

| Archivo | Cambios Principales |
|---------|---------------------|
| `DashboardHome.tsx` | `getColorClasses()` → eliminar emerald/cyan/blue/purple/amber, usar zinc + primary |
| `ClientsPage.tsx` | Botones de filtro → `border-zinc-700` en lugar de colores específicos |
| `ClientsTable.tsx` | Iconos WhatsApp/SMS → neutros, badges semánticos mantener |
| `InvoicesPage.tsx` | Iconos Stripe/PayPal → neutros (sin colores de marca) |
| `MovementsPage.tsx` | `getSourceConfig()` → unificar colores, stats cards → zinc |
| `MessagesPage.tsx` | `channelConfig` → colores neutros |
| `RecoveryPage.tsx` | Botón Auto-Dunning → `bg-primary` (sin gradiente), stage cards → zinc |
| `SubscriptionsPage.tsx` | `getColorClasses()` → zinc + primary, funnel cards neutros |

### Grupo 2: Componentes de Soporte (5 archivos)

| Archivo | Cambios Principales |
|---------|---------------------|
| `CampaignControlCenter.tsx` | `channelColors` → todos `bg-zinc-800` |
| `AnalyticsPanel.tsx` | AI section → `border-zinc-800` sin gradiente |
| `Sidebar.tsx` | Ya está correcto (usa accent/primary) |
| `Header.tsx` | Ya está correcto |
| `SettingsPage.tsx` | Ya está correcto |

### Grupo 3: Componentes de Analytics (3 archivos)

| Archivo | Cambios |
|---------|---------|
| `LTVMetrics.tsx` | Cards con colores → zinc |
| `MRRMovementsChart.tsx` | Colores de gráficos → grises + primary |
| `SourceAnalytics.tsx` | Badges de fuente → neutros |

---

## Detalle de Cambios por Archivo

### 1. DashboardHome.tsx (~líneas 402-414)

**Antes:**
```tsx
const getColorClasses = (color: string) => {
  const colors: Record<string, { bg: string; text: string; icon: string; border: string }> = {
    primary: { bg: 'bg-primary/10', text: 'text-primary', icon: 'text-primary', border: 'border-primary/30' },
    emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: 'text-emerald-500', border: 'border-emerald-500/30' },
    cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', icon: 'text-cyan-500', border: 'border-cyan-500/30' },
    // ... más colores
  };
```

**Después:**
```tsx
const getColorClasses = (color: string, isNegative?: boolean) => {
  // Todos los KPIs usan estilo neutro, excepto los negativos (riesgo)
  if (isNegative) {
    return { bg: 'bg-red-500/10', text: 'text-red-400', icon: 'text-red-500', border: 'border-red-500/30' };
  }
  return { bg: 'bg-zinc-800', text: 'text-foreground', icon: 'text-primary', border: 'border-zinc-700' };
};
```

### 2. ClientsPage.tsx (~líneas 147-227)

**Antes:**
```tsx
<Button className="gap-1.5 text-xs border-emerald-500/30 hover:bg-emerald-500/10">
<Button className="gap-1.5 text-xs border-purple-500/30 hover:bg-purple-500/10">
<Button className="gap-1.5 text-xs border-orange-500/30 hover:bg-orange-500/10">
```

**Después:**
```tsx
// Todos los botones de filtro con estilo neutro
<Button variant={isActive ? 'default' : 'outline'} className="gap-1.5 text-xs border-zinc-700 hover:bg-zinc-800">
```

### 3. InvoicesPage.tsx (~líneas 204-218)

**Antes:**
```tsx
const getSourceBadge = (source: 'stripe' | 'paypal') => {
  if (source === 'paypal') {
    return <Badge className="bg-[#0070ba]/10 text-[#0070ba] border-[#0070ba]/30">
  return <Badge className="bg-[#635bff]/10 text-[#635bff] border-[#635bff]/30">
```

**Después:**
```tsx
const getSourceBadge = (source: 'stripe' | 'paypal') => {
  // Mismo estilo neutro para ambas fuentes
  return (
    <Badge variant="outline" className="bg-zinc-800 text-white border-zinc-700 gap-1">
      {source === 'paypal' ? <PayPalIcon /> : <StripeIcon />}
      {source === 'paypal' ? 'PayPal' : 'Stripe'}
    </Badge>
  );
};
```

### 4. MovementsPage.tsx (~líneas 128-136)

**Antes:**
```tsx
const getSourceConfig = (source: string | null) => {
  stripe: { className: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
  paypal: { className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  web: { className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
```

**Después:**
```tsx
const getSourceConfig = (source: string | null) => {
  // Estilo unificado para todas las fuentes
  const baseStyle = "bg-zinc-800 text-white border-zinc-700";
  return { className: baseStyle, icon: getIconForSource(source) };
};
```

### 5. RecoveryPage.tsx (~líneas 373-384)

**Antes:**
```tsx
<Button className="gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
```

**Después:**
```tsx
<Button className="gap-2 bg-primary hover:bg-primary/90">
```

### 6. SubscriptionsPage.tsx (~líneas 66-75)

**Antes:**
```tsx
const getColorClasses = (color: string) => {
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
```

**Después:**
```tsx
const getColorClasses = (color: string) => {
  // Solo mantener semánticos (emerald=ok, red=riesgo), resto neutro
  if (color === 'red') return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' };
  if (color === 'emerald') return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' };
  return { bg: 'bg-zinc-800', text: 'text-foreground', border: 'border-zinc-700' };
};
```

### 7. MessagesPage.tsx (~líneas 32-51)

**Antes:**
```tsx
const channelConfig = {
  sms: { color: "bg-blue-500", textColor: "text-blue-600" },
  whatsapp: { color: "bg-green-500", textColor: "text-green-600" },
  email: { color: "bg-orange-500", textColor: "text-orange-600" },
};
```

**Después:**
```tsx
const channelConfig = {
  sms: { color: "bg-zinc-700", textColor: "text-white" },
  whatsapp: { color: "bg-zinc-700", textColor: "text-white" },
  email: { color: "bg-zinc-700", textColor: "text-white" },
};
```

### 8. CampaignControlCenter.tsx (~líneas 114-119)

**Antes:**
```tsx
const channelColors: Record<string, string> = {
  whatsapp: 'bg-[#25D366]/10 text-[#25D366] border-[#25D366]/30',
  sms: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  email: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  messenger: 'bg-[#0084FF]/10 text-[#0084FF] border-[#0084FF]/30',
};
```

**Después:**
```tsx
const channelColors: Record<string, string> = {
  whatsapp: 'bg-zinc-800 text-white border-zinc-700',
  sms: 'bg-zinc-800 text-white border-zinc-700',
  email: 'bg-zinc-800 text-white border-zinc-700',
  messenger: 'bg-zinc-800 text-white border-zinc-700',
};
```

---

## Iconos de Headers por Sección

Todos los iconos principales de cada sección usarán `text-primary`:

| Sección | Icono | Antes | Después |
|---------|-------|-------|---------|
| DashboardHome | Zap | `text-primary` | ✓ (ya correcto) |
| Clientes | Users | `text-primary` | ✓ (ya correcto) |
| Facturas | FileText | `text-blue-500` | `text-primary` |
| Movimientos | Activity | `text-primary` | ✓ (ya correcto) |
| Mensajes | MessageSquare | (default) | `text-primary` |
| Recuperación | AlertTriangle | `text-amber-500` | `text-primary` |
| Suscripciones | CreditCard | `text-purple-500` | `text-primary` |
| Campañas | Send | `text-primary` | ✓ (ya correcto) |
| Analytics | Sparkles | `text-primary` | ✓ (ya correcto) |
| Settings | Settings | `text-primary` | ✓ (ya correcto) |

---

## Excepciones Semánticas (Mantener)

Estos colores tienen significado funcional y deben mantenerse:

| Contexto | Color | Uso |
|----------|-------|-----|
| Estado "Exitoso/Pagado" | `emerald-500` | Badges de estado |
| Estado "Fallido/Error" | `red-500` | Badges de estado |
| Estado "Pendiente/Advertencia" | `amber-500` | Badges de estado |
| Indicador VIP | `yellow-500` | Corona + texto |
| Ventana WhatsApp 24h | `green-500` | Badge "Ventana abierta" |

---

## Resumen de Archivos (16 total)

```text
src/components/dashboard/
├── DashboardHome.tsx        (~20 líneas de estilo)
├── ClientsPage.tsx          (~15 líneas de estilo)
├── ClientsTable.tsx         (~10 líneas de estilo)
├── InvoicesPage.tsx         (~15 líneas de estilo)
├── MovementsPage.tsx        (~20 líneas de estilo)
├── MessagesPage.tsx         (~10 líneas de estilo)
├── RecoveryPage.tsx         (~10 líneas de estilo)
├── SubscriptionsPage.tsx    (~15 líneas de estilo)
├── CampaignControlCenter.tsx (~10 líneas de estilo)
└── analytics/
    ├── AnalyticsPanel.tsx   (~5 líneas de estilo)
    ├── LTVMetrics.tsx       (~10 líneas de estilo)
    ├── MRRMovementsChart.tsx (~5 líneas de estilo)
    └── SourceAnalytics.tsx  (~5 líneas de estilo)
```

---

## Resultado Visual Esperado

Después de aplicar estos cambios:

1. **Consistencia total**: Todas las secciones usan la misma paleta Zinc + VRP Red
2. **Jerarquía clara**: Solo los botones de acción principal son rojos
3. **Legibilidad**: Texto siempre blanco o gris, nunca colores
4. **Profesionalismo**: Estética tipo Stripe/Linear dark mode
5. **Semántica**: Colores solo para estados (éxito/error/advertencia)

