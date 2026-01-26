# Guía: Conectar a Supabase

## 🔐 Credenciales Necesarias

Para conectarme a tu Supabase, necesito estas credenciales:

1. **SUPABASE_URL** - URL de tu proyecto
2. **SUPABASE_SERVICE_ROLE_KEY** - Key con permisos de administrador
3. **SUPABASE_PUBLISHABLE_KEY** (opcional) - Para verificar conexión

## 📋 Pasos para Obtenerlas

### Opción A: Desde Lovable Cloud (Actual)

1. **Ve a Lovable Cloud:**
   - https://cloud.lovable.dev
   - Inicia sesión

2. **Settings → Environment Variables:**
   - Busca estas variables:
     - `VITE_SUPABASE_URL` o `SUPABASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY` o `VITE_SUPABASE_SERVICE_ROLE_KEY`
     - `VITE_SUPABASE_PUBLISHABLE_KEY` (opcional)

3. **Copia los valores:**
   - Haz clic en el ojo 👁️ para revelar
   - Copia cada valor

### Opción B: Desde Supabase Dashboard (Si tienes acceso directo)

1. **Ve a Supabase Dashboard:**
   - https://supabase.com/dashboard
   - Selecciona tu proyecto

2. **Settings → API:**
   - **Project URL:** `https://xxxxx.supabase.co`
   - **anon/public key:** (Publishable Key)
   - **service_role key:** (Service Role Key - ⚠️ SECRETO)

## 🔒 Forma Segura de Compartir

### Método 1: Variables de Entorno (Recomendado)

Crea un archivo temporal `.env.local` (NO lo subas a git):

```bash
# En tu terminal local
cd /Users/gustavogarcia/Documents/CURSOR/CRM/admin-hub

# Crea archivo temporal
cat > .env.local << EOF
SUPABASE_URL=tu-url-aqui
SUPABASE_SERVICE_ROLE_KEY=tu-service-key-aqui
SUPABASE_PUBLISHABLE_KEY=tu-publishable-key-aqui
EOF
```

Luego puedo leerlo desde el código.

### Método 2: Compartir en el Chat (Menos Seguro)

Puedes compartirlas aquí, pero **cámbialas después** por seguridad.

Formato:
```
SUPABASE_URL: https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY: eyJhbGc...
SUPABASE_PUBLISHABLE_KEY: eyJhbGc...
```

### Método 3: Script de Verificación

Te doy un script que puedes ejecutar localmente para verificar la conexión sin compartir las keys:

```javascript
// test-connection.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'tu-url';
const SUPABASE_KEY = 'tu-service-key';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Test connection
async function test() {
  const { data, error } = await supabase.from('clients').select('count').limit(1);
  if (error) {
    console.error('❌ Error:', error.message);
  } else {
    console.log('✅ Conexión exitosa!');
    console.log('Total clientes:', data);
  }
}

test();
```

## 🎯 Qué Puedo Hacer con las Credenciales

Una vez que tenga acceso, puedo:

1. **Verificar conexión:**
   - Probar que las credenciales funcionan
   - Ver estructura de la base de datos

2. **Analizar datos:**
   - Contar registros por tabla
   - Ver tamaño de la base de datos
   - Identificar tablas grandes

3. **Preparar migración:**
   - Exportar schema completo
   - Generar scripts de migración
   - Preparar backup de datos

4. **Optimizar:**
   - Identificar índices faltantes
   - Sugerir optimizaciones
   - Analizar queries lentas

5. **Crear backup:**
   - Exportar datos a SQL
   - Preparar para migración a Supabase Cloud

## ⚠️ Seguridad

**IMPORTANTE:**
- ⚠️ **Service Role Key** tiene acceso TOTAL a la DB
- ⚠️ **NO la compartas públicamente**
- ⚠️ **Cámbiala después** si la compartes aquí
- ✅ Puedes revocarla y crear una nueva en Supabase Dashboard

## 📝 Pasos Rápidos

1. **Obtén las credenciales** (Lovable Cloud → Settings → Environment Variables)
2. **Compártelas aquí** (o usa el método de archivo local)
3. **Yo verifico la conexión** y te confirmo
4. **Procedemos con lo que necesites** (migración, análisis, etc.)

---

**¿Listo? Comparte las credenciales cuando estés listo.**
