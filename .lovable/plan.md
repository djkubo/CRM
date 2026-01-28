
# Plan de Reparación: MRR y Filtros de Fecha en Analytics

## Resumen Ejecutivo
Voy a corregir dos problemas críticos en la sección Analytics:

1. **MRR**: Actualmente calcula el ingreso histórico del mes pasado. Lo cambiaré para que sume el valor de suscripciones activas (`status = 'active'`).

2. **Filtros de Fecha**: Actualmente solo afectan las tarjetas KPI. Los propagaré a todas las gráficas (MRR Movements, Cohortes, Source Analytics).

---

## Cambio 1: Corregir Fórmula de MRR (PRIORIDAD MÁXIMA)

### Problema Actual
```text
LTVMetrics.tsx (línea 32-38):
  - Lee transacciones del mes pasado
  - Suma todos los pagos exitosos (succeeded/paid)
  - Esto NO es MRR, es ingreso histórico
```

### Solución
Modificar `LTVMetrics.tsx` para:
1. Recibir las suscripciones activas desde props (o usar el hook `useSubscriptions`)
2. Calcular MRR como: `SUM(amount) WHERE status = 'active'`

### Archivos a Modificar

**src/components/dashboard/analytics/LTVMetrics.tsx**
```text
ANTES:
  - Props: transactions[]
  - MRR = suma de transacciones del mes pasado
  
DESPUÉS:
  - Props: transactions[], subscriptions[] (NUEVO)
  - MRR = suma de subs.amount WHERE status = 'active'
```

**src/components/dashboard/analytics/AnalyticsPanel.tsx**
```text
ANTES:
  - Solo pasa transactions y clients a LTVMetrics
  
DESPUÉS:
  - Importar useSubscriptions()
  - Pasar subscriptions a LTVMetrics
```

### Código Propuesto (LTVMetrics)
```typescript
// Nuevo: Recibir subscriptions como prop
interface LTVMetricsProps {
  transactions: Transaction[];
  subscriptions: Subscription[];  // NUEVO
}

// Nuevo cálculo de MRR
const mrr = useMemo(() => {
  const activeSubscriptions = subscriptions.filter(
    (s) => s.status === "active"
  );
  return activeSubscriptions.reduce((sum, s) => sum + s.amount, 0) / 100;
}, [subscriptions]);
```

---

## Cambio 2: Propagar Filtro de Fechas a Gráficas

### Problema Actual
```text
┌─────────────────────────────────────────┐
│  Command Center (filter: today/7d/...)  │
│         ↓                               │
│  useDailyKPIs ✅                        │
│         ↓                               │
│  KPI Cards ✅ (responden al filtro)     │
│                                         │
│  AnalyticsPanel ❌ (sin filtro)         │
│    ├─ SourceAnalytics ❌                │
│    ├─ LTVMetrics ❌                     │
│    ├─ MRRMovementsChart ❌              │
│    └─ CohortRetentionTable ❌           │
└─────────────────────────────────────────┘
```

### Solución
Crear un filtro de período dentro de Analytics y conectarlo a todos los componentes hijos.

### Archivos a Modificar

**src/components/dashboard/analytics/AnalyticsPanel.tsx**
```text
NUEVO:
  - Agregar estado local [period, setPeriod] = useState<'7d' | '30d' | '90d' | 'all'>('30d')
  - Agregar selector visual de período
  - Pasar period a todos los componentes hijos
  - Filtrar transactions/clients según período antes de pasarlos
```

**src/components/dashboard/analytics/MRRMovementsChart.tsx**
```text
ANTES: Siempre muestra últimos 6 meses hardcodeado
DESPUÉS: Recibe prop 'period' y ajusta el rango de meses
```

**src/components/dashboard/analytics/CohortRetentionTable.tsx**
```text
ANTES: Siempre muestra últimos 6 meses hardcodeado
DESPUÉS: Recibe prop 'period' y ajusta número de cohortes
```

**src/components/dashboard/analytics/SourceAnalytics.tsx**
```text
ANTES: Siempre usa últimos 30 días hardcodeado
DESPUÉS: Recibe prop 'period' y ajusta el query
```

### UI Propuesta
```text
┌────────────────────────────────────────────┐
│  Analytics                                 │
│  [7d] [30d] [90d] [Todo] ← selector nuevo  │
│                                            │
│  ┌─ Por Fuente ─┬─ LTV & MRR ─┬─ Cohortes ─┤
│  │              │             │            │
│  │   (gráficas responden al período)       │
│  │                                         │
│  └─────────────────────────────────────────┘
└────────────────────────────────────────────┘
```

---

## Resumen de Cambios

| Archivo | Cambio |
|---------|--------|
| `LTVMetrics.tsx` | Nuevo cálculo MRR desde suscripciones activas |
| `AnalyticsPanel.tsx` | Agregar selector de período + pasar subscriptions |
| `MRRMovementsChart.tsx` | Aceptar prop `period` y ajustar rango |
| `CohortRetentionTable.tsx` | Aceptar prop `period` y ajustar cohortes |
| `SourceAnalytics.tsx` | Aceptar prop `period` y ajustar query |

---

## Validación Post-Cambio

Una vez implementados los cambios, podré confirmar:

1. **Nuevo MRR**: Será la suma de suscripciones `status = 'active'`, diferente al valor anterior
2. **Filtros Reactivos**: Al cambiar el período, las gráficas se redibujarán mostrando solo datos del rango seleccionado

---

## Detalles Técnicos

### Mapeo de Período a Rango de Fechas
```typescript
function getDateRange(period: AnalyticsPeriod) {
  const now = new Date();
  switch (period) {
    case '7d':  return subDays(now, 7);
    case '30d': return subDays(now, 30);
    case '90d': return subDays(now, 90);
    case 'all': return subYears(now, 10);
  }
}
```

### Filtrado de Transacciones por Período
```typescript
const filteredTransactions = useMemo(() => {
  const startDate = getDateRange(period);
  return transactions.filter(tx => {
    if (!tx.stripe_created_at) return false;
    return new Date(tx.stripe_created_at) >= startDate;
  });
}, [transactions, period]);
```
