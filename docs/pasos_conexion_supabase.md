# 🔌 Pasos para Conectarme a tu Supabase

## Opción 1: Compartir Credenciales Directamente (Rápido)

### Paso 1: Obtén las Credenciales

Ve a **Lovable Cloud → Settings → Environment Variables** y copia:

1. **SUPABASE_URL** (o `VITE_SUPABASE_URL`)
   - Formato: `https://xxxxx.supabase.co`

2. **SUPABASE_SERVICE_ROLE_KEY** (o `VITE_SUPABASE_SERVICE_ROLE_KEY`)
   - Formato: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (JWT largo)

3. **SUPABASE_PUBLISHABLE_KEY** (opcional, para verificar)
   - Formato: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (JWT largo)

### Paso 2: Compártelas Aquí

Puedes compartirlas en este formato:

```
SUPABASE_URL: https://qskmzaxzhkrlchycbria.supabase.co
SUPABASE_SERVICE_ROLE_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_PUBLISHABLE_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**⚠️ Nota de Seguridad:** Después de que termine, puedes revocar la Service Role Key y crear una nueva en Supabase Dashboard.

---

## Opción 2: Usar Archivo Local (Más Seguro)

### Paso 1: Crea Archivo Temporal

```bash
cd /Users/gustavogarcia/Documents/CURSOR/CRM/admin-hub
nano .env.local
```

### Paso 2: Agrega las Credenciales

```env
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Paso 3: Ejecuta Script de Prueba

```bash
node scripts/test-supabase-connection.js
```

Esto verificará la conexión sin compartir las keys aquí.

---

## Opción 3: Ya Tienes las Credenciales en .env

Si ya tienes un `.env` con las credenciales, puedo leerlas directamente:

```bash
# Verifica que existan
cat .env | grep SUPABASE
```

Si están ahí, puedo usarlas directamente.

---

## 🎯 Qué Haré con las Credenciales

Una vez conectado, puedo:

1. ✅ **Verificar conexión** - Confirmar que funciona
2. ✅ **Analizar datos** - Contar registros, ver estructura
3. ✅ **Preparar migración** - Exportar schema y datos
4. ✅ **Crear backups** - Generar SQL dumps
5. ✅ **Optimizar** - Identificar problemas de rendimiento

---

## ⚡ Método Más Rápido

**Solo comparte las 3 credenciales aquí** y yo:
1. Verifico la conexión
2. Analizo tu base de datos actual
3. Preparo el plan de migración (si quieres moverte a Supabase Cloud)

**¿Listo? Pega las credenciales cuando quieras.**
