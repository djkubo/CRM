# Prompt para Lovable: Desplegar Edge Function process-csv-bulk

## 🎯 Objetivo

Desplegar la nueva Edge Function `process-csv-bulk` que procesa CSVs masivos directamente en el servidor, sin límites de timeout del navegador.

## 📋 Instrucciones

1. **Verificar que la Edge Function existe** en `supabase/functions/process-csv-bulk/index.ts`
2. **Verificar configuración** en `supabase/config.toml` (debe incluir `[functions.process-csv-bulk]`)
3. **Desplegar la Edge Function** para que esté disponible en producción
4. **Verificar que aparece** en la lista de Edge Functions activas

## 📁 Archivos Relevantes

### 1. Edge Function: `supabase/functions/process-csv-bulk/index.ts`

Esta función procesa CSVs masivos de múltiples tipos:
- **GHL** (GoHighLevel) - 217k+ contactos
- **Stripe Payments** - PAGOS.csv, unified_payments.csv
- **Stripe Customers** - unified_customers.csv (LTV)
- **PayPal** - Download*.CSV

**Características:**
- Procesa directamente en servidor (sin límites de timeout)
- Usa `SUPABASE_SERVICE_ROLE_KEY` internamente (no expuesta)
- Autenticación via JWT + `is_admin()` RPC
- Procesa en batches de 1000 registros
- Auto-detecta tipo de CSV si no se especifica

### 2. Configuración: `supabase/config.toml`

Debe incluir esta sección:

```toml
[functions.process-csv-bulk]
verify_jwt = false
```

**Nota:** `verify_jwt = false` porque la autenticación se maneja dentro de la función usando `is_admin()` RPC.

## ✅ Verificación Post-Despliegue

Después del despliegue, verifica:

1. **Edge Functions activas:**
   - Debe aparecer `process-csv-bulk` en la lista
   - Estado: `Active`
   - Última actualización: Reciente

2. **Logs:**
   - Revisa los logs de la función para confirmar que está funcionando
   - Debe mostrar mensajes de log cuando se procesa un CSV

3. **Prueba funcional:**
   - Sube un CSV grande (>10MB) desde la app
   - Debe procesarse sin errores de timeout
   - Verifica que los datos se insertan correctamente en la DB

## 🔍 Troubleshooting

Si la función no aparece:

1. **Verifica que el archivo existe:**
   ```bash
   ls -la supabase/functions/process-csv-bulk/index.ts
   ```

2. **Verifica la configuración:**
   ```bash
   grep -A 2 "process-csv-bulk" supabase/config.toml
   ```

3. **Revisa logs de despliegue:**
   - Lovable Cloud → Deployments → Ver logs más recientes
   - Busca errores relacionados con `process-csv-bulk`

## 📝 Notas Importantes

- Esta función es **crítica** para procesar CSVs grandes (217k+ registros)
- Reemplaza el intento anterior de usar scripts locales (que no funcionan con Lovable Cloud)
- La función usa `SUPABASE_SERVICE_ROLE_KEY` que está disponible en el entorno de Edge Functions
- No expone credenciales al cliente (seguridad)

## 🚀 Resultado Esperado

Después de ejecutar este prompt, deberías ver:

```
✅ Edge Function process-csv-bulk desplegada
✅ Aparece en la lista de Edge Functions activas
✅ Lista para procesar CSVs masivos desde la app
```

---

**Prompt para Lovable:**

```
Necesito que despliegues la nueva Edge Function process-csv-bulk que está en supabase/functions/process-csv-bulk/index.ts.

Esta función procesa CSVs masivos (GHL, Stripe Payments, Stripe Customers, PayPal) directamente en el servidor sin límites de timeout.

Verifica que:
1. El archivo existe en supabase/functions/process-csv-bulk/index.ts
2. La configuración en supabase/config.toml incluye [functions.process-csv-bulk] con verify_jwt = false
3. Despliega la función para que esté disponible en producción
4. Confirma que aparece en la lista de Edge Functions activas

Esta función es crítica para procesar CSVs grandes (217k+ registros) que fallan en el navegador por timeout.
```
