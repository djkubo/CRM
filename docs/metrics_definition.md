# Definiciones de Métricas - Revenue Ops OS

## Timezone Oficial
**America/Mexico_City (CST/CDT)** - Usada en TODAS las consultas de "HOY", "Esta semana", "Este mes".

---

## Fuentes de Verdad

| Tabla | Propósito | Llave Principal |
|-------|-----------|-----------------|
| `clients` | Identidad del cliente | `email` (normalizado a lowercase, trimmed) |
| `transactions` | Revenue (Stripe + PayPal + Web) | `UNIQUE(source, payment_key)` |
| `subscriptions` | Lifecycle (trial/active/canceled) | `stripe_subscription_id` |
| `invoices` | Cuentas por cobrar | `stripe_invoice_id` |
| `client_events` | Log de CRM/campañas | `id` |

---

## Definiciones de Métricas

### 1. VENTA (Sale)
- **Definición**: Transacción con `status = 'succeeded'` y `amount > 0`
- **Fuente**: `transactions`
- **Exclusiones**: Refunds, chargebacks, montos negativos
- **Moneda**: Se reporta por separado USD y MXN (sin conversión automática)

### 2. REFUND / CHARGEBACK
- **Definición**: Transacción con `amount < 0` O `status IN ('refunded', 'disputed')`
- **Fuente**: `transactions`
- **Reportado**: Por separado de ventas, nunca restado del total de ventas

### 3. NUEVO PAGO (New Customer Payment)
- **Definición**: Primera transacción exitosa de un `customer_email`
- **Lógica**: 
  ```sql
  NOT EXISTS (
    SELECT 1 FROM transactions t2 
    WHERE t2.customer_email = t.customer_email 
    AND t2.stripe_created_at < t.stripe_created_at
    AND t2.status = 'succeeded'
  )
  ```
- **Fuente**: `transactions` + lookup por email

### 4. RENOVACIÓN (Renewal)
- **Definición**: Transacción exitosa donde el email ya tiene pagos previos
- **Lógica**: `payment_type = 'renewal'` O (email con transacciones anteriores)
- **Fuente**: `transactions`

### 5. TRIAL
- **Definición**: Suscripción con `trial_start IS NOT NULL` y `trial_end > NOW()`
- **Fuente**: `subscriptions`
- **Estado**: `status = 'trialing'`

### 6. TRIAL → PAID (Conversión)
- **Definición**: Suscripción que:
  1. Tenía `trial_start IS NOT NULL`
  2. Ahora tiene `status = 'active'`
  3. Tiene al menos una transacción exitosa después de `trial_end`
- **Fuente**: `subscriptions` + `transactions`
- **Cálculo**: `payment_type = 'trial_conversion'`

### 7. CHURN (Últimos 30 días)
- **Definición**: Suscripciones con `status IN ('canceled', 'expired')` y `canceled_at >= NOW() - INTERVAL '30 days'`
- **Fuente**: `subscriptions`
- **Excluye**: Suscripciones que fueron reactivadas

### 8. MRR (Monthly Recurring Revenue)
- **Definición**: Suma de `amount` de suscripciones activas, normalizado a mensual
- **Lógica**:
  ```sql
  SUM(CASE 
    WHEN interval = 'year' THEN amount / 12
    WHEN interval = 'month' THEN amount
    ELSE amount
  END)
  ```
- **Fuente**: `subscriptions WHERE status = 'active'`
- **Moneda**: Por separado (MRR_USD, MRR_MXN)

### 9. AT RISK REVENUE
- **Definición**: Suma de `amount_due` de facturas con `status IN ('open', 'past_due')`
- **Fuente**: `invoices`

### 10. FAILED PAYMENTS
- **Definición**: Transacciones con `status = 'failed'` en el rango de tiempo
- **Fuente**: `transactions`

---

## Deduplicación

### Transactions
- **Constraint**: `UNIQUE(source, payment_key)`
- **Payment Key por fuente**:
  - Stripe: `invoice_id` (si existe) → `payment_intent_id`
  - PayPal: `transaction_id`
  - Web/Scraper: `web_<external_id>`

### Imports
- Se guarda `import_batch_id` por cada importación
- Hash de fila para detectar duplicados exactos

### Regla de Idempotencia
> Si ejecuto Sync o Import 2 veces consecutivas, los KPIs NO deben cambiar.

---

## Reconciliación

### Proceso
1. Consultar API externa (Stripe/PayPal) para obtener totales por período
2. Consultar base de datos interna para el mismo período
3. Calcular diferencia
4. Listar transacciones faltantes o duplicadas

### Estados
- ✅ **OK**: Diferencia < 1% o < $10
- ⚠️ **WARNING**: Diferencia 1-5% o $10-$100
- ❌ **FAIL**: Diferencia > 5% o > $100

---

## Data Quality Checks

| Check | Crítico | Descripción |
|-------|---------|-------------|
| Pagos sin email | ⚠️ | % de transacciones sin customer_email |
| Clientes sin teléfono | ℹ️ | % de clientes sin phone |
| Duplicados por phone | ⚠️ | Emails diferentes con mismo teléfono |
| Moneda mezclada | ⚠️ | Transacciones USD vs MXN sin flag |
| Emails no normalizados | ❌ | Mayúsculas o espacios en emails |

---

## Rebuild Metrics

### Proceso
1. Calcular en tablas staging (`metrics_staging`)
2. Comparar con `metrics_current`
3. Mostrar diff de cambios
4. Admin aprueba "Promote"
5. Copiar staging → current
6. Log de rebuild guardado

---

## Changelog
- 2026-01-20: Versión inicial
