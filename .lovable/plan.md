

# Plan: Arreglar Error 406 - Proyecto Supabase Incorrecto

## Problema Detectado

El error en consola muestra:
```
GET https://qskmzaxzhkrlchycbria.supabase.co/rest/v1/agents... 406 (Not Acceptable)
```

Pero el proyecto actual de Lovable Cloud usa:
```
https://sbexeqqizazjfsbsgrbd.supabase.co
```

**Diagnóstico:** El navegador está ejecutando código viejo que apunta a un proyecto Supabase diferente.

---

## Causa Raíz

| Archivo | URL en código | Problema |
|---------|---------------|----------|
| `.env` | `sbexeqqizazjfsbsgrbd` | ✅ Correcto |
| `import-all-csvs.js` | `qskmzaxzhkrlchycbria` | ❌ URL vieja hardcodeada |
| `docs/pasos_conexion_supabase.md` | `qskmzaxzhkrlchycbria` | ❌ Documentación obsoleta |
| `docs/obtener_credenciales_rapido.md` | `qskmzaxzhkrlchycbria` | ❌ Documentación obsoleta |

El Service Worker de PWA está cacheando el bundle viejo que apunta al proyecto incorrecto.

---

## Solución

### Fase 1: Limpiar URLs Hardcodeadas

**Archivo: `import-all-csvs.js`**
```javascript
// Antes:
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://qskmzaxzhkrlchycbria.supabase.co';

// Después - sin fallback hardcodeado:
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  console.error('❌ VITE_SUPABASE_URL no está configurada');
  process.exit(1);
}
```

**Archivos de documentación:** Actualizar para usar variables de entorno en lugar de URLs específicas.

### Fase 2: Forzar Actualización del Service Worker

Agregar un script que invalide el Service Worker viejo:

**Archivo: `index.html`** (agregar antes de `</body>`):
```html
<script>
  // Force SW update on load
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(registration => {
        registration.update();
      });
    });
  }
</script>
```

### Fase 3: Incrementar Versión del PWA

El cache del PWA persiste entre deploys. Forzar nueva versión:

**Archivo: `vite.config.ts`** (en configuración de PWA):
```typescript
manifest: {
  name: "ZEN Admin",
  short_name: "ZEN",
  version: "2.0.0", // Incrementar versión
  // ...
}
```

---

## Pasos para el Usuario

Después de aplicar los cambios, el usuario debe:

1. **Limpiar cache del navegador** o abrir en ventana privada
2. **O** desregistrar el Service Worker manualmente:
   - Abrir DevTools → Application → Service Workers → Unregister

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `import-all-csvs.js` | Eliminar URL hardcodeada |
| `docs/pasos_conexion_supabase.md` | Actualizar a usar variables |
| `docs/obtener_credenciales_rapido.md` | Actualizar a usar variables |
| `index.html` | Script para actualizar SW |
| `vite.config.ts` | Incrementar versión PWA |

---

## Impacto

- ✅ Nuevos deploys no tendrán URLs hardcodeadas
- ✅ Service Worker se actualizará automáticamente
- ✅ Cache viejo será invalidado
- ✅ Error 406 desaparecerá

