# 📋 Guía: Qué CSVs Subir y en Qué Orden

## 🎯 Orden Recomendado (Importante)

Sube los CSVs en este orden para evitar conflictos:

### 1️⃣ **Contactos Primero** (Base de datos de clientes)
- ✅ `Export_Contacts_undefined_Jan_2026_11_59_AM.csv` - **GHL (217k contactos)**
  - **Tamaño:** ~20-30MB
  - **Usará Edge Function automáticamente** (muy grande)
  - **Tiempo estimado:** 15-20 minutos
  - **Resultado:** Crea/actualiza clientes base

- ✅ `users.csv` - **Usuarios Web**
  - **Tamaño:** Pequeño
  - **Procesamiento:** Local (rápido)
  - **Resultado:** Agrega usuarios web a clientes

### 2️⃣ **Datos de LTV** (Valor de vida del cliente)
- ✅ `unified_customers.csv` - **Stripe Customers (LTV)**
  - **Tamaño:** Variable
  - **Usará Edge Function si >5MB**
  - **Resultado:** Actualiza `total_spend` y `is_delinquent` en clientes existentes

### 3️⃣ **Transacciones** (Historial de pagos)
- ✅ `PAGOS.csv` - **Stripe Payments (67MB)** ⚠️ MUY GRANDE
  - **Tamaño:** 67MB
  - **Usará Edge Function automáticamente**
  - **Tiempo estimado:** 10-15 minutos
  - **Resultado:** Crea transacciones y actualiza clientes

- ✅ `unified_payments.csv` - **Stripe Payments**
  - **Tamaño:** Variable
  - **Usará Edge Function si >10MB**
  - **Resultado:** Más transacciones Stripe

### 4️⃣ **Suscripciones**
- ✅ `subscriptions.csv` - **Suscripciones**
  - **Tamaño:** Pequeño
  - **Procesamiento:** Local
  - **Resultado:** Crea/actualiza suscripciones

### 5️⃣ **PayPal** (Último, porque puede tener duplicados)
- ✅ `Download.CSV` - **PayPal**
- ✅ `Download-2.CSV` - **PayPal**
- ✅ `Download-3.CSV` - **PayPal**
- ✅ `Download-4.CSV` - **PayPal**
- ✅ `Download-5.CSV` - **PayPal**
- ✅ `Download-6.CSV` - **PayPal**
- ✅ `Download-7.CSV` - **PayPal**
  - **Tamaño:** Variable (cada uno)
  - **Usarán Edge Function si >10MB cada uno**
  - **Resultado:** Transacciones PayPal

## 📊 Resumen por Prioridad

### 🔴 **CRÍTICOS (Subir primero)**
1. `Export_Contacts_undefined_Jan_2026_11_59_AM.csv` - Base de clientes
2. `unified_customers.csv` - LTV de clientes
3. `PAGOS.csv` - Transacciones principales

### 🟡 **IMPORTANTES (Subir después)**
4. `unified_payments.csv` - Más transacciones
5. `subscriptions.csv` - Suscripciones
6. `users.csv` - Usuarios web

### 🟢 **COMPLEMENTARIOS (Subir al final)**
7. `Download*.CSV` (8 archivos) - PayPal

## ⏱️ Tiempo Total Estimado

- **GHL (217k):** ~15-20 min
- **PAGOS (67MB):** ~10-15 min
- **Resto:** ~5-10 min
- **Total:** ~30-45 minutos

## ✅ Cómo Subirlos

### Opción 1: Todos a la Vez (Recomendado)
1. Ve a la app → **CSV Uploader**
2. **Arrastra TODOS los archivos** a la vez
3. El sistema los procesará en el orden correcto automáticamente
4. **Espera** a que termine cada uno

### Opción 2: Por Lotes (Más Control)
1. **Lote 1:** GHL + users.csv → Espera a que termine
2. **Lote 2:** unified_customers.csv → Espera
3. **Lote 3:** PAGOS.csv + unified_payments.csv → Espera
4. **Lote 4:** subscriptions.csv → Espera
5. **Lote 5:** Todos los Download*.CSV → Espera

## 🎯 Recomendación Final

**Sube TODOS a la vez** - El sistema:
- ✅ Los ordena automáticamente
- ✅ Procesa los grandes en servidor (sin timeout)
- ✅ Muestra progreso en tiempo real
- ✅ Te avisa cuando termine cada uno

## ⚠️ Importante

- **No cierres la pestaña** mientras procesa
- **Los archivos grandes** mostrarán "Procesando en servidor..."
- **Puede tardar 30-45 minutos** en total
- **Verifica los resultados** después de cada archivo grande

## 📊 Verificar Resultados

Después de subir, verifica en Lovable Cloud → Database:
- **clients:** Debe aumentar significativamente
- **transactions:** Debe tener nuevas transacciones
- **subscriptions:** Debe tener nuevas suscripciones

---

**¿Listo? Ve a CSV Uploader y arrastra todos los archivos! 🚀**
