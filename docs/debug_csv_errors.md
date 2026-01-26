# 🔍 Debug: Errores al Procesar CSV

## ❓ ¿Qué Error Exacto Ves?

Para ayudarte mejor, necesito saber:

1. **¿Qué mensaje de error aparece?**
   - En el toast/notificación
   - En la consola del navegador (F12)

2. **¿En qué archivo falla?**
   - ¿GHL? ¿Stripe Payments? ¿PayPal?

3. **¿Cuándo falla?**
   - ¿Inmediatamente al subir?
   - ¿Después de procesar un rato?
   - ¿Al final?

## 🔧 Errores Comunes y Soluciones

### Error 1: "Unauthorized" o "Forbidden"
**Causa:** Problema de autenticación
**Solución:**
- Cierra sesión y vuelve a iniciar
- Verifica que eres admin
- Revisa la consola del navegador (F12) para más detalles

### Error 2: "Missing csvText"
**Causa:** El archivo no se leyó correctamente
**Solución:**
- Intenta subir el archivo de nuevo
- Verifica que el archivo no esté corrupto
- Prueba con un archivo más pequeño primero

### Error 3: "Unsupported CSV type"
**Causa:** La función no detectó el tipo automáticamente
**Solución:**
- Selecciona manualmente el tipo en el dropdown
- Verifica que el CSV tiene las columnas correctas

### Error 4: Timeout
**Causa:** Archivo muy grande procesándose localmente
**Solución:**
- Ya está corregido - archivos grandes usan Edge Function
- Si persiste, verifica que la Edge Function esté desplegada

### Error 5: Error en la consola
**Causa:** Varios posibles
**Solución:**
- Abre la consola (F12)
- Copia el error completo
- Compártelo aquí

## 🧪 Cómo Obtener el Error Exacto

1. **Abre la consola del navegador:**
   - Presiona F12
   - Ve a la pestaña "Console"

2. **Intenta subir el CSV de nuevo**

3. **Copia el error completo:**
   - Busca líneas en rojo
   - Copia el mensaje completo
   - Incluye el stack trace si aparece

4. **Comparte aquí:**
   - Pega el error
   - Indica qué archivo estabas subiendo

## 📋 Checklist de Verificación

Antes de reportar el error, verifica:

- [ ] Estás logueado en la app
- [ ] Tienes permisos de admin
- [ ] La Edge Function `process-csv-bulk` aparece en Lovable Cloud
- [ ] El archivo CSV no está corrupto
- [ ] El tipo de CSV está seleccionado correctamente
- [ ] La consola del navegador no muestra otros errores

## 🚀 Prueba Rápida

Prueba con un CSV pequeño primero:

1. Crea un CSV de prueba con 10 filas
2. Súbelo
3. Si funciona, el problema es con archivos grandes
4. Si falla, el problema es general

---

**¿Puedes compartir el error exacto que ves? Así lo arreglo rápido.**
