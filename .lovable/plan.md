
# 📊 Auditoría Técnica: Sección Facturas (Invoices)

## 🎯 Resumen Ejecutivo

| Dimensión | Estado | Comentario |
|-----------|--------|------------|
| **Funcionalidad de Cobro** | 🟢 OPERATIVA | Botones conectados a API Stripe real |
| **Cobertura de Fuentes** | 🔴 INCOMPLETO | Solo Stripe, NO incluye PayPal |
| **PDFs Descargables** | 🟢 OPERATIVA | 97.5% tienen URL de Stripe |
| **Vinculación a CRM** | 🔴 CRÍTICO | Solo 5.3% vinculadas a clientes |
| **Coherencia con Revenue** | 🔴 DISCREPANCIA | Facturas muestran $5,053 vs Transacciones $283,766 |

**Semáforo Final: 🟡 VISOR PARCIAL**
Puedo cobrar facturas reales de Stripe, pero NO tengo visibilidad completa para contabilidad (falta PayPal) y los datos no están conectados al CRM unificado.

---

## 1. Arquitectura y Fuentes de Datos

### 📌 Origen de Facturas
```text
FUENTE: API de Stripe → Tabla local `invoices`
SINCRONIZACIÓN: Edge Function `fetch-invoices`
  - Modo "recent": últimos 90 días
  - Modo "full": histórico completo
  - Paginación: 100 facturas por página con auto-continuación
```

**Flujo de datos:**
```
Stripe API (/v1/invoices)
    ↓ fetch-invoices (Edge Function)
    ↓ Upsert con expand[]=subscription, customer, lines
    ↓ Tabla `invoices` (1,101 registros)
    ↓ useInvoices (React Query + Realtime)
    ↓ InvoicesPage.tsx
```

### 📌 Cobertura de Fuentes

| Fuente | Facturas | Notas |
|--------|----------|-------|
| **Stripe** | 1,101 (100%) | ✅ Todas son de Stripe (`in_*`) |
| **PayPal** | 0 (0%) | ❌ **NO HAY FACTURAS PAYPAL** |
| **Web Sales** | 0 (0%) | ❌ No aplica (son ventas directas) |

**PROBLEMA CRÍTICO**: Este mes hay **$18,729** en transacciones PayPal que NO aparecen en facturas. Tu contador no verá ese dinero aquí.

### 📌 PDFs Descargables

| Métrica | Valor |
|---------|-------|
| Total Facturas | 1,101 |
| Con PDF URL | 1,074 (97.5%) ✅ |
| Con Hosted URL | 1,076 (97.7%) ✅ |

**Veredicto**: Los botones de PDF funcionan y usan la URL hospedada de Stripe (`invoice.invoice_pdf`). NO se generan al vuelo.

---

## 2. Funcionalidad de Acciones

### ✅ Botón "Cobrar" (Individual)
```typescript
// InvoicesPage.tsx:81-98
handleChargeInvoice → invokeWithAdminKey('force-charge-invoice', { invoice_id })
  ↓
// force-charge-invoice/index.ts:76-115
if (status === 'draft') → stripe.invoices.finalizeInvoice()
if (status === 'open') → stripe.invoices.pay()
  ↓
Actualiza invoices.status en Supabase
```
**Estado**: 🟢 **FUNCIONAL** - Conectado a API real de Stripe.

### ✅ Botón "Cobrar Todas"
```typescript
// InvoicesPage.tsx:100-138
handleChargeAll → Loop con 300ms delay entre cada cobro
  - Muestra barra de progreso
  - Suma total recuperado
  - Resumen de éxitos/fallos
```
**Estado**: 🟢 **FUNCIONAL** - Respeta rate limits de Stripe.

### ❌ Botón "Enviar Recordatorio"
**NO EXISTE** en la implementación actual. Solo hay:
- Cobrar (individual)
- Cobrar Todas
- Ver PDF
- Ver en Stripe (external link)

### ✅ Exportar CSV
```typescript
// useInvoices.ts:300-338
exportToCSV() → Genera CSV con todos los datos filtrados
```
**Estado**: 🟢 **FUNCIONAL**

---

## 3. Manejo de Estados

### Estadísticas por Estado

| Estado | Cantidad | Monto | Con PDF | Vinculado a Cliente |
|--------|----------|-------|---------|---------------------|
| **uncollectible** | 683 | $19,915 | 683 (100%) | 0 (0%) ❌ |
| **paid** | 222 | $5,102 | 222 (100%) | 46 (21%) |
| **open** | 171 | $8,091 | 169 (99%) | 0 (0%) ❌ |
| **draft** | 25 | $1,340 | 0 (0%) | 12 (48%) |

### Filtrado de Estados en UI

| Estado | ¿Se Muestra? | Badge Color | Acción Disponible |
|--------|--------------|-------------|-------------------|
| draft | ✅ Sí | Gris (Borrador) | Cobrar |
| open | ✅ Sí | Azul (Abierta) | Cobrar |
| paid | ✅ Sí | Verde (Pagada) | Ver PDF |
| void | ✅ Sí | Rojo (Anulada) | - |
| uncollectible | ✅ Sí | Ámbar (Incobrable) | Ver PDF |

**Nota**: NO hay distinción visual entre `open` (pendiente normal) y `past_due` (vencida). Stripe no tiene estado `past_due` en invoices, pero sí en subscriptions.

---

## 4. Widget "Dinero en Camino"

### Lógica Actual
```typescript
// useInvoices.ts:278-288
const invoicesNext72h = invoices.filter((inv) => {
  if (!inv.next_payment_attempt || inv.status !== 'open') return false;
  const attemptDate = new Date(inv.next_payment_attempt);
  return attemptDate <= next72Hours;
});
```

### Datos Actuales
```text
Próximas 72 horas:
├── draft: 2 facturas → $63
├── open: 58 facturas → $3,200
└── TOTAL: 60 facturas → $3,263 proyectados
```

**PROBLEMA**: El filtro excluye `draft`. Solo suma `open` con `next_payment_attempt`. Los drafts deberían contarse porque Stripe los finaliza automáticamente.

### Corrección Necesaria
```typescript
// Debería incluir drafts también:
const invoicesNext72h = invoices.filter((inv) => {
  if (!['open', 'draft'].includes(inv.status)) return false;
  // Para drafts, usar automatically_finalizes_at
  const targetDate = inv.next_payment_attempt || inv.automatically_finalizes_at;
  if (!targetDate) return false;
  return new Date(targetDate) <= next72Hours;
});
```

---

## 5. Coherencia con Perfil de Cliente

### Vinculación CRM
```text
Total Facturas: 1,101
Vinculadas a client_id: 58 (5.3%) ❌ CRÍTICO

Causa: batchResolveClients() busca por stripe_customer_id,
pero solo 5% de clientes tienen ese campo poblado.
```

### Ejemplo de Discrepancia

| Cliente | Transacciones | Total Tx | Facturas | Total Inv |
|---------|---------------|----------|----------|-----------|
| djkubo@live.com.mx | 70 | $2,732 | 1 | $0 |
| chacas1@outlook.com | 73 | $1,600 | 0 | N/A |
| vjcdamian@gmail.com | 74 | $1,575 | 0 | N/A |

**Problema**: Clientes con historial de $1,500+ solo tienen 0-1 facturas porque:
1. Sus pagos son de PayPal (no genera invoice)
2. Son pagos únicos (one-time charges, no subscriptions)

---

## 6. Coherencia Facturas vs Revenue

### Mes Actual (Enero 2026)

| Fuente | Registros | Monto |
|--------|-----------|-------|
| **Invoices (paid)** | 219 | $5,053 |
| **Transactions (stripe)** | 10,522 | $283,766 |
| **Transactions (paypal)** | 359 | $18,729 |
| **Transactions (web)** | 163 | $3,449 |

### Discrepancia: $278,713 NO APARECEN EN FACTURAS

**Razón**:
1. Stripe Invoices solo rastrea **suscripciones recurrentes**
2. Los **one-time charges** no generan invoice
3. PayPal y Web Sales nunca generan invoices en Stripe

---

## 7. Brechas Críticas Identificadas

### 🔴 Brecha 1: Suscripciones sin Factura
```text
Suscripciones activas: 1,331
Suscripciones con factura vinculada: 0 ❌

Causa: subscription_id no está siendo vinculado correctamente
durante la sincronización.
```

### 🔴 Brecha 2: Uncollectibles Ocultos
```text
Facturas incobrables: 683
Monto perdido: $19,915
Rango: 2020 → 2026

Estas NO están siendo usadas para métricas de recuperación.
```

### 🔴 Brecha 3: Sin PayPal Invoices
```text
PayPal Revenue este mes: $18,729
PayPal en sistema de facturas: $0

Para contabilidad necesitas:
- fetch-paypal-transactions con recibos
- O crear "pseudo-invoices" desde transacciones PayPal
```

---

## 8. Resumen de Archivos Analizados

| Archivo | Propósito | Estado |
|---------|-----------|--------|
| `src/components/dashboard/InvoicesPage.tsx` | UI principal | ✅ Funcional |
| `src/hooks/useInvoices.ts` | Lógica de datos | ✅ Funcional |
| `supabase/functions/fetch-invoices/index.ts` | Sync con Stripe | ✅ Funcional |
| `supabase/functions/force-charge-invoice/index.ts` | Cobro forzado | ✅ Funcional |
| `src/components/dashboard/IncomingRevenueCard.tsx` | Widget proyección | 🟡 Excluye drafts |
| `src/components/dashboard/PendingInvoicesTable.tsx` | Lista cobros | ✅ Funcional |

---

## 9. Recomendaciones de Reparación

### Prioridad Alta
1. **Vincular client_id en facturas**: Actualizar `batchResolveClients` para buscar también por email
2. **Incluir drafts en proyección**: Corregir lógica de `invoicesNext72h`
3. **Crear pseudo-invoices de PayPal**: Para que el contador vea todo el revenue

### Prioridad Media
4. **Conectar subscription_id**: La tabla tiene el campo pero está vacío en 95% de casos
5. **Métricas de Uncollectibles**: Mostrar el $19,915 perdido como alerta

### Prioridad Baja
6. **Botón "Enviar Recordatorio"**: Implementar integración con email/SMS

---

## 10. Veredicto Final

**🟡 VISOR PARCIAL**

| Capacidad | Estado |
|-----------|--------|
| Ver facturas de Stripe | ✅ |
| Descargar PDFs | ✅ |
| Cobrar manualmente | ✅ |
| Cobrar en lote | ✅ |
| Ver PayPal | ❌ |
| Dar cuentas al contador | ❌ (incompleto) |
| Conectar con CRM | ❌ (5% vinculado) |
| Proyección precisa | 🟡 (excluye drafts) |

**Para usar esto con tu contador**, necesitas:
1. Exportar CSV desde aquí (solo Stripe)
2. Exportar transacciones PayPal por separado
3. Combinar manualmente en Excel

**O implementar**: Un reporte unificado que sume Invoices + Transactions de todas las fuentes.
