
# Plan: Optimización del Frontend de Sincronización de Stripe

## Objetivo
Mejorar la visualización del progreso de sincronización de Stripe para que muestre información detallada en tiempo real (página actual, progreso estimado) igual que PayPal.

## Cambios Requeridos

### Archivo: `src/components/dashboard/APISyncPanel.tsx`

#### 1. Actualizar State de Stripe Progress
Agregar campos para página actual:
```typescript
const [stripeProgress, setStripeProgress] = useState<{ 
  current: number; 
  total: number; 
  status?: string;
  page?: number;        // NUEVO
  cursor?: string;      // NUEVO  
} | null>(null);
```

#### 2. Modificar Polling de Stripe para Obtener Checkpoint
Cambiar la query de polling para incluir el checkpoint:
```typescript
// ANTES
.select('status, total_fetched, total_inserted')

// DESPUÉS
.select('status, total_fetched, total_inserted, checkpoint')
```

#### 3. Parsear y Usar los Datos del Checkpoint
```typescript
const checkpoint = data.checkpoint as { 
  page?: number; 
  cursor?: string;
  lastActivity?: string;
} | null;

if (data.status === 'running' || data.status === 'continuing') {
  setStripeProgress({ 
    current: data.total_fetched || 0, 
    total: 0,
    page: checkpoint?.page,
    cursor: checkpoint?.cursor
  });
  
  // Toast mejorado con página
  const pageInfo = checkpoint?.page ? ` (Página ${checkpoint.page})` : '';
  toast.info(`Stripe: ${(data.total_fetched || 0).toLocaleString()} transacciones${pageInfo}...`, { 
    id: 'stripe-sync' 
  });
}
```

#### 4. Mejorar UI del Indicador de Progreso
Agregar badge de página y calcular progreso estimado:
```typescript
{stripeProgress && (
  <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/30 space-y-2">
    <div className="flex items-center gap-2 text-sm text-purple-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>Stripe: {stripeProgress.current.toLocaleString()} transacciones</span>
    </div>
    {/* NUEVO: Badge de página */}
    <div className="flex items-center gap-2 text-xs text-gray-400">
      {stripeProgress.page && (
        <Badge variant="outline" className="text-purple-300 border-purple-500/50">
          Página {stripeProgress.page}
        </Badge>
      )}
    </div>
    <Progress 
      value={stripeProgress.page ? Math.min(stripeProgress.page * 0.1, 95) : 50} 
      className="h-2"
    />
    <p className="text-xs text-gray-400">
      Procesando en background... Actualizando cada 3s
    </p>
  </div>
)}
```

## Resultado Visual Esperado

```text
┌────────────────────────────────────────────────────────┐
│ 💜 Stripe: 797 transacciones                           │
│ ┌─────────────┐                                        │
│ │ Página 8    │                                        │
│ └─────────────┘                                        │
│ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  (estimado)     │
│ Procesando en background... Actualizando cada 3s       │
└────────────────────────────────────────────────────────┘
```

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/components/dashboard/APISyncPanel.tsx` | Polling mejorado + UI con badge de página |

## Tiempo Estimado
- Modificación mínima (~20 líneas)
- Sin cambios de backend (ya funciona correctamente)

## Notas Técnicas
- El sync de Stripe actual está funcionando correctamente y sigue activo
- Velocidad: ~100 tx/página cada ~20 segundos (limitado por lookups de customer)
- No se requieren cambios en el edge function `fetch-stripe`
