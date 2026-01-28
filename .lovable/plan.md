
# Plan: Actualización Final del Command Center a "Torre de Control" (🟢)

## Resumen Ejecutivo
Transformar el Dashboard Principal de **Desactualizado (🟡)** a **Torre de Control (🟢)** integrando las métricas reales validadas en otros módulos y habilitando navegación activa.

---

## Hallazgos de la Auditoría

### Datos Confirmados en Base de Datos
| Métrica | Valor Real | Fuente |
|---------|-----------|--------|
| **MRR** | $69,009 USD | 1,332 suscripciones activas |
| **Revenue at Risk** | $498,513 USD | 21,367 facturas (open + draft) |
| **Facturas Open** | $258,568 USD | 10,419 facturas |
| **Facturas Draft** | $239,945 USD | 10,948 facturas |

### Problemas Actuales
1. **MRR Ausente**: No hay tarjeta de MRR en el Command Center
2. **Revenue at Risk Incorrecto**: Usa `failuresToday × $50` (estimación) en lugar del total real de facturas pendientes
3. **KPI Cards No Clicables**: Las tarjetas son solo visuales, no navegan
4. **Sin Botón Broadcast**: No hay acceso directo a campañas

---

## Cambios a Implementar

### 1. Agregar Tarjeta de MRR
**Archivo**: `src/components/dashboard/DashboardHome.tsx`

- Crear una nueva tarjeta KPI prominente para "MRR Actual"
- Usar la misma lógica de `LTVMetrics.tsx`: suma de `subscriptions.amount` donde `status = 'active'`
- Hacer la tarjeta clicable para navegar a Analytics

```text
+------------------+
|   💰 MRR         |
|   $69,009        |
|   1,332 activas  |
+------------------+
```

### 2. Corregir Revenue at Risk
**Archivo**: `src/components/dashboard/DashboardHome.tsx`

Reemplazar la lógica actual:
```typescript
// ANTES (incorrecto)
const atRiskAmount = kpis.failuresToday * 50;
```

Por una consulta real a facturas pendientes:
```typescript
// DESPUÉS (correcto)
const { data: pendingInvoices } = await supabase
  .from('invoices')
  .select('amount_due')
  .in('status', ['open', 'past_due']);
const revenueAtRisk = pendingInvoices.reduce((sum, inv) => sum + inv.amount_due, 0) / 100;
```

Mostrar en rojo prominente con navegación a Recovery.

### 3. Navegación Activa en KPI Cards
**Archivo**: `src/components/dashboard/DashboardHome.tsx`

Agregar `onClick` handlers a cada tarjeta:

| Tarjeta | Navega a |
|---------|----------|
| MRR | Analytics |
| Ventas | Movimientos |
| Nuevos Clientes | Clientes |
| Fallos / Riesgo | Recovery |
| Trials | Suscripciones |
| Cancelaciones | Suscripciones |

### 4. Botón de Broadcast (Quick Action)
**Archivo**: `src/components/dashboard/DashboardHome.tsx`

Agregar botón en el header junto a "Sync All":
```text
[ 📢 Broadcast ] [ 🔄 Sync All ▾ ]
```

El botón navegará a la sección "campaigns" (Campaign Control Center).

---

## Detalles Técnicos

### Hook Modificado: useDailyKPIs
Se agregará una nueva query para obtener el MRR y Revenue at Risk en tiempo real:

```typescript
// Agregar a useDailyKPIs o crear hook separado
const fetchRevenueMetrics = async () => {
  const [mrrResult, atRiskResult] = await Promise.all([
    supabase.from('subscriptions')
      .select('amount')
      .eq('status', 'active'),
    supabase.from('invoices')
      .select('amount_due')
      .in('status', ['open', 'past_due'])
  ]);
  
  return {
    mrr: mrrResult.data?.reduce((sum, s) => sum + s.amount, 0) / 100,
    revenueAtRisk: atRiskResult.data?.reduce((sum, i) => sum + i.amount_due, 0) / 100
  };
};
```

### UI de Tarjetas Clicables
Agregar cursor pointer y visual feedback:
```typescript
<div
  onClick={() => onNavigate?.('analytics')}
  className="cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
>
  {/* KPI content */}
</div>
```

### Estructura Final del Grid de KPIs
```text
[ MRR ][ Ventas ][ Nuevos ][ Trials ][ T→Paid ][ Renovs ][ Fallos ][ Cancel ]
  ↓        ↓        ↓         ↓         ↓         ↓         ↓         ↓
Analytics  Movs   Clients   Subs      Subs      Subs    Recovery   Subs
```

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `src/components/dashboard/DashboardHome.tsx` | Agregar MRR card, corregir Revenue at Risk, hacer cards clicables, agregar botón Broadcast |
| `src/hooks/useDailyKPIs.ts` | Agregar queries para MRR y Revenue at Risk real |

---

## Resultado Esperado

Después de implementar:

1. **MRR visible** mostrando `$69,009` con 1,332 suscripciones activas
2. **Revenue at Risk real** mostrando `~$258k-498k` (según filtro open/draft) en rojo
3. **Navegación con un clic** desde cualquier KPI a su sección detallada
4. **Acceso directo a Broadcast** para enviar campañas rápidas

El Command Center pasará de **🟡 Desactualizado** a **🟢 Torre de Control**.
