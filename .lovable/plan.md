
# Plan de Emergencia: Reparación de Estabilidad Backend

## Diagnóstico Crítico

### Problema Principal
La base de datos está **completamente saturada** por queries sin límites ejecutándose desde el frontend:

| Tabla | Filas | Tamaño | Query Problemática |
|-------|-------|--------|-------------------|
| `csv_imports_raw` | 663,660 | 613 MB | Sin uso directo |
| `clients` | 221,275 | 175 MB | `useClients` carga sin paginación inicial |
| `transactions` | 206,817 | 366 MB | `useTransactions` descarga TODAS las filas |
| `ghl_contacts_raw` | 188,325 | 317 MB | Temporal, sin índices |
| `invoices` | 79,811 | 314 MB | `useInvoices` sin límite |

### Errores Detectados

1. **504 Gateway Timeout** - Queries exceden 8 segundos
2. **Statement Timeout** - Postgres cancela queries lentas
3. **React forwardRef Warning** - Componente `Skeleton` no soporta refs

---

## Plan de Reparación (3 Acciones)

### ACCIÓN 1: Limitar Queries Críticas

**Archivo: `src/hooks/useTransactions.ts`**

El problema: Descarga 206,817 filas sin límite.

Solución: Agregar `.limit(1000)` y paginación:

```typescript
// ANTES (línea 32-38)
const { data, error } = await supabase
  .from("transactions")
  .select("*")
  .order("stripe_created_at", { ascending: false });

// DESPUÉS
const { data, error } = await supabase
  .from("transactions")
  .select("*")
  .order("stripe_created_at", { ascending: false })
  .limit(1000); // Solo últimos 1000
```

**Archivo: `src/pages/Index.tsx`**

El problema: Llama a `useClients()` y `useTransactions()` en cada render aunque no se muestran inmediatamente.

Solución: Lazy loading - solo cargar datos cuando se necesitan:

```typescript
// ANTES (línea 33-34)
const { clients } = useClients();
const { transactions } = useTransactions();

// DESPUÉS - Eliminar estos hooks del Index.tsx
// Cada página cargará sus propios datos
```

---

### ACCIÓN 2: Agregar Índices Faltantes

**Nueva Migración SQL**

Los queries que fallan necesitan índices para acelerar las búsquedas:

```sql
-- Índice para transactions por fecha (usado en useMetrics)
CREATE INDEX IF NOT EXISTS idx_transactions_stripe_created_at 
ON transactions(stripe_created_at DESC);

-- Índice compuesto para sync_runs (usado en SyncStatusBanner)
CREATE INDEX IF NOT EXISTS idx_sync_runs_status_completed 
ON sync_runs(status, completed_at DESC);

-- Índice para clients por lifecycle_stage (usado en useMetrics)
CREATE INDEX IF NOT EXISTS idx_clients_lifecycle_stage 
ON clients(lifecycle_stage);

-- Índice para transactions por status (usado en recovery list)
CREATE INDEX IF NOT EXISTS idx_transactions_status 
ON transactions(status);
```

---

### ACCIÓN 3: Corregir Error de forwardRef

**Archivo: `src/components/ui/skeleton.tsx`**

El problema: React advierte que `Skeleton` no puede recibir refs.

Solución: Usar `React.forwardRef`:

```typescript
// ANTES
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

// DESPUÉS
const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("animate-pulse rounded-md bg-muted", className)}
        {...props}
      />
    );
  }
);
Skeleton.displayName = "Skeleton";
```

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/hooks/useTransactions.ts` | Agregar `.limit(1000)` |
| `src/pages/Index.tsx` | Eliminar hooks innecesarios |
| `src/components/ui/skeleton.tsx` | Agregar `forwardRef` |
| Nueva migración SQL | Crear 4 índices críticos |

---

## Resultado Esperado

| Antes | Después |
|-------|---------|
| Queries de 206K filas | Queries de 1K filas máx |
| Timeouts constantes | Respuestas < 500ms |
| Error de forwardRef | Sin warnings de React |
| 504 Gateway Timeout | Página carga normal |

---

## Sección Técnica

### Por qué fallan las queries

Supabase tiene un **statement_timeout** de 8 segundos por defecto. Cuando una query tarda más:

1. Postgres cancela el statement
2. PostgREST devuelve 504 Gateway Timeout
3. El frontend muestra "Error inesperado"

### Por qué los índices ayudan

Sin índice: Full table scan de 206K filas = 15+ segundos
Con índice: B-tree lookup = 10-50ms

### El efecto cascada

Cuando `Index.tsx` monta:
1. Llama `useClients()` → Query a 221K filas
2. Llama `useTransactions()` → Query a 206K filas
3. Llama `useMetrics()` → 5+ queries adicionales

**Resultado**: 7+ queries pesadas en paralelo = Database overload
