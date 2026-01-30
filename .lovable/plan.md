
# Plan: Optimización de Velocidad - 5 Problemas Detectados

## Resumen de Problemas

| Problema | Ahorro Estimado | Causa Principal |
|----------|-----------------|-----------------|
| **JavaScript no usado** | 299 KiB | Librerías pesadas (recharts, xyflow) cargadas en bundle principal |
| **Cache ineficiente** | 456 KiB | Sin headers de cache en config de Vite |
| **Render blocking** | 120 ms | Fuentes de Google cargadas síncronamente |
| **CSS no usado** | 17 KiB | Tailwind sin purge optimizado |
| **Cadena de dependencias** | - | Imports síncronos de componentes pesados |

---

## Fase 1: Reducir JavaScript No Usado (299 KiB)

### 1.1 Lazy Loading de Páginas Pesadas

Actualmente solo `AnalyticsPanel` y componentes de Settings usan lazy loading. Las páginas con librerías pesadas deben cargarse bajo demanda:

**Páginas a convertir en lazy:**
- `FlowsPage` - usa `@xyflow/react` (librería muy pesada ~150KB)
- `MovementsPage` - usa tablas con muchos datos
- `CampaignControlCenter` - componente complejo
- `BroadcastListsPage` - listas de difusión
- `DiagnosticsPanel` - herramientas de diagnóstico

**Cambio en `src/App.tsx`:**
```typescript
// Lazy load pages with heavy dependencies
const FlowsPage = lazy(() => 
  import("@/components/dashboard/FlowsPage").then(m => ({ default: m.FlowsPage }))
);
const MovementsPage = lazy(() => 
  import("@/components/dashboard/MovementsPage").then(m => ({ default: m.MovementsPage }))
);
const CampaignControlCenter = lazy(() => 
  import("@/components/dashboard/CampaignControlCenter").then(m => ({ default: m.CampaignControlCenter }))
);
const DiagnosticsPanel = lazy(() => 
  import("@/components/dashboard/DiagnosticsPanel")
);
```

### 1.2 Code Splitting en Vite

Configurar Vite para separar chunks automáticamente por vendor:

**Cambio en `vite.config.ts`:**
```typescript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        'vendor-charts': ['recharts'],
        'vendor-flow': ['@xyflow/react'],
        'vendor-query': ['@tanstack/react-query'],
        'vendor-supabase': ['@supabase/supabase-js'],
        'vendor-ui': [
          '@radix-ui/react-dialog',
          '@radix-ui/react-dropdown-menu',
          '@radix-ui/react-popover',
          '@radix-ui/react-select',
          '@radix-ui/react-tabs',
          '@radix-ui/react-tooltip',
        ],
      },
    },
  },
  chunkSizeWarningLimit: 500,
},
```

---

## Fase 2: Eliminar Render Blocking (120 ms)

### 2.1 Optimizar Carga de Fuentes

El problema está en `src/index.css` línea 6:
```css
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@300;400;500;600;700&display=swap');
```

Esta línea bloquea el renderizado. Se debe:

1. Mover la carga de fuentes al `index.html` con `preconnect` y `preload`
2. Usar `font-display: swap` ya está correcto

**Cambio en `index.html` (agregar en `<head>`):**
```html
<!-- Preconnect to Google Fonts -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />

<!-- Load fonts asynchronously -->
<link 
  rel="stylesheet" 
  href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@300;400;500;600;700&display=swap"
  media="print" 
  onload="this.media='all'" 
/>
```

**Cambio en `src/index.css`:**
Eliminar la línea `@import url(...)` ya que ahora se carga en HTML.

---

## Fase 3: Optimizar Cache (456 KiB)

### 3.1 Configurar Headers de Cache en Vite

Agregar configuración de assets con hash para cache largo:

**Cambio en `vite.config.ts`:**
```typescript
build: {
  rollupOptions: {
    output: {
      // Agregar hash a nombres de archivos para cache busting
      entryFileNames: 'assets/[name]-[hash].js',
      chunkFileNames: 'assets/[name]-[hash].js',
      assetFileNames: 'assets/[name]-[hash].[ext]',
      // ... manualChunks ya definido
    },
  },
},
```

### 3.2 Mejorar Workbox en PWA

El cache de PWA ya está configurado pero se puede mejorar:

```typescript
workbox: {
  globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts-cache",
        expiration: {
          maxEntries: 10,
          maxAgeSeconds: 60 * 60 * 24 * 365, // 1 año
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
    {
      urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts-webfonts",
        expiration: {
          maxEntries: 30,
          maxAgeSeconds: 60 * 60 * 24 * 365,
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
  ],
},
```

---

## Fase 4: Reducir CSS No Usado (17 KiB)

### 4.1 Optimizar Tailwind Config

Verificar que `tailwind.config.ts` tenga purge correctamente configurado:

```typescript
content: [
  "./index.html",
  "./src/**/*.{js,ts,jsx,tsx}",
],
```

Esto ya está configurado correctamente. El CSS no usado probablemente viene de:
- Clases definidas en `@layer components` que no se usan
- Variantes de dark mode duplicadas

### 4.2 Limpiar CSS Duplicado

En `src/index.css` hay definiciones duplicadas de variables para `.dark` y `:root`. Se puede simplificar:

```css
/* Eliminar .dark {} ya que las variables son idénticas a :root */
/* El tema es siempre oscuro */
```

---

## Fase 5: Romper Cadenas de Dependencias

### 5.1 Precargar Módulos Críticos

Agregar hints de preload para módulos críticos:

**Cambio en `index.html`:**
```html
<link rel="modulepreload" href="/src/main.tsx" />
```

### 5.2 Diferir Componentes No Críticos

Los componentes como `Toaster`, `Sonner`, `OfflineBanner` pueden cargarse después del primer render:

```typescript
// En App.tsx - cargar después de mount
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);

// Render condicional
{mounted && (
  <>
    <Toaster />
    <Sonner />
    <OfflineBanner />
    <QueryErrorHandler />
  </>
)}
```

---

## Archivos a Modificar

| Archivo | Cambios |
|---------|---------|
| `vite.config.ts` | Code splitting con manualChunks, asset naming |
| `index.html` | Preconnect fonts, font loading async, modulepreload |
| `src/index.css` | Eliminar @import de fonts, limpiar CSS duplicado |
| `src/App.tsx` | Lazy loading de páginas pesadas, diferir no-críticos |
| `tailwind.config.ts` | Verificar content paths (ya correcto) |

---

## Impacto Esperado

| Métrica | Antes | Después |
|---------|-------|---------|
| JavaScript inicial | ~800KB | ~400KB (-50%) |
| Tiempo de render | +120ms | 0ms (no blocking) |
| Cache efficiency | 0% | 90%+ |
| First Contentful Paint | ~2s | ~1.2s |

---

## Sección Técnica

### Build Output con Code Splitting

```text
dist/assets/
├── index-[hash].js          # Core app (~150KB)
├── vendor-react-[hash].js   # React libs (~50KB)
├── vendor-charts-[hash].js  # Recharts (~180KB) - lazy
├── vendor-flow-[hash].js    # XYFlow (~150KB) - lazy
├── vendor-ui-[hash].js      # Radix components (~80KB)
└── ...page chunks
```

### Cache Strategy

```text
Static Assets (JS/CSS/Images)
├── Cache-Control: public, max-age=31536000, immutable
└── Versionado con hash en filename

Fonts (Google Fonts)
├── Preconnect para DNS prefetch
├── CacheFirst strategy en Service Worker
└── TTL: 1 año

API Calls (Supabase)
├── NetworkFirst strategy
└── Fallback a cache si offline
```
