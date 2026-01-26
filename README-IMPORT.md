# 🚀 Importación Masiva de CSVs - Guía Rápida

## ⚡ Solución Directa (Sin App)

Este script inyecta **TODOS** los CSVs directamente en la base de datos, sin usar la app.

## 📋 Requisitos

1. **Service Role Key de Supabase**
   - Ve a Lovable Cloud → Settings → Environment Variables
   - Busca `SUPABASE_SERVICE_ROLE_KEY`
   - Cópialo

2. **Configurar la Key**

   Opción A (temporal):
   ```bash
   export SUPABASE_SERVICE_ROLE_KEY="tu-key-aqui"
   ```

   Opción B (permanente):
   ```bash
   echo 'SUPABASE_SERVICE_ROLE_KEY=tu-key-aqui' >> .env
   ```

## 🎯 Ejecutar

```bash
cd /Users/gustavogarcia/Documents/CURSOR/CRM/admin-hub
node import-all-csvs.js
```

## 📁 Archivos que Procesa

El script detecta automáticamente:
- ✅ `Export_Contacts_*.csv` → GHL (217k contactos)
- ✅ `users.csv` → Usuarios web
- ✅ `unified_customers.csv` → Stripe Customers (LTV)
- ✅ `PAGOS.csv` → Stripe Payments
- ✅ `unified_payments.csv` → Stripe Payments
- ✅ `subscriptions.csv` → Suscripciones
- ✅ `Download*.CSV` → PayPal (8 archivos)

## ⏱️ Tiempo Estimado

- GHL (217k): ~15-20 minutos
- Stripe Payments (67MB): ~10-15 minutos
- PayPal (8 archivos): ~5-10 minutos
- Resto: ~5 minutos

**Total: ~30-50 minutos**

## 📊 Qué Hace

1. Lee todos los CSVs del directorio
2. Los procesa en orden correcto:
   - Contactos primero (GHL, users)
   - Luego LTV (unified_customers)
   - Luego pagos (PAGOS, unified_payments)
   - Luego suscripciones
   - Finalmente PayPal
3. Inserta/actualiza en batches de 1000
4. Muestra progreso en tiempo real
5. Resumen final al terminar

## ✅ Ventajas

- ✅ **Sin límites de timeout** (no usa navegador)
- ✅ **Sin problemas de memoria** (procesa en batches)
- ✅ **Más rápido** (conexión directa a DB)
- ✅ **Más confiable** (sin dependencias de la app)
- ✅ **Progreso claro** (logs detallados)

## 🔍 Verificar Resultados

Después de ejecutar, verifica en Lovable Cloud → Database:
- Tabla `clients`: debería aumentar
- Tabla `transactions`: debería tener nuevas transacciones
- Tabla `subscriptions`: debería tener nuevas suscripciones

## ⚠️ Si Hay Errores

El script muestra errores específicos. Los más comunes:
- **"Falta SUPABASE_SERVICE_ROLE_KEY"** → Configura la key (ver arriba)
- **"Archivo no encontrado"** → Verifica que los CSVs estén en `/Users/gustavogarcia/Downloads/SUBIR A LOVABLE`
- **Errores de conexión** → Verifica que la key sea correcta
