

# Plan: Persistencia de Estados de Recuperación (Fix Amnesia)

## Resumen Ejecutivo
Actualmente, el estado de recuperación de cada deudor (`pending`, `contacted`, `paid`, `lost`) se almacena en un `useState` local en `RecoveryPage.tsx`. Al recargar la página, todos los estados se pierden y los clientes vuelven a aparecer como "Pendientes". Implementaremos persistencia real en la base de datos para que el progreso de seguimiento se conserve permanentemente.

## Análisis del Problema

### Estado Actual
```text
┌───────────────────────────────────────────────────────────────┐
│                  RecoveryPage.tsx                             │
├───────────────────────────────────────────────────────────────┤
│  const [stages, setStages] = useState({})                     │
│       ↑                                                       │
│   Vacío al cargar → Todos aparecen como 'pending'             │
│                                                               │
│  setStage(email, stage):                                      │
│    1. ✅ Actualiza estado local                               │
│    2. ✅ Registra evento en client_events                     │
│    3. ❌ NO guarda en clients table                           │
│    4. ❌ NO se recupera al recargar                           │
└───────────────────────────────────────────────────────────────┘
```

### Solución Propuesta
Almacenaremos `recovery_status` dentro del campo JSONB `customer_metadata` de la tabla `clients`, ya que:
- La tabla `clients` ya tiene campos JSONB (`customer_metadata`)
- No requiere migración de esquema (menos riesgoso)
- El campo ya se usa para datos adicionales de clientes

---

## Cambios a Implementar

### 1. Modificar `useMetrics.ts` - Incluir `recovery_status` en la consulta

**Archivo**: `src/hooks/useMetrics.ts`

**Cambio**: Al consultar los clientes para el `recoveryList`, incluir el campo `customer_metadata` para extraer el `recovery_status` guardado.

**Antes (líneas 159-162)**:
```typescript
const { data: clients } = await supabase
  .from('clients')
  .select('email, full_name, phone')
  .in('email', failedEmails.slice(0, 100));
```

**Después**:
```typescript
const { data: clients } = await supabase
  .from('clients')
  .select('email, full_name, phone, customer_metadata')
  .in('email', failedEmails.slice(0, 100));
```

**Actualizar interfaz `recoveryList`** para incluir `recovery_status`:
```typescript
recoveryList: Array<{
  email: string;
  full_name: string | null;
  phone: string | null;
  amount: number;
  source: string;
  recovery_status?: 'pending' | 'contacted' | 'paid' | 'lost'; // NUEVO
}>;
```

---

### 2. Modificar `RecoveryPage.tsx` - Lectura (Fetch)

**Archivo**: `src/components/dashboard/RecoveryPage.tsx`

**Cambio**: Al cargar la página, inicializar el estado `stages` con los valores guardados en `recoveryList[].recovery_status`.

**Agregar `useEffect` para cargar estados** (después de línea 68):
```typescript
// Initialize stages from saved recovery_status in database
useEffect(() => {
  if (metrics.recoveryList?.length) {
    const savedStages: Record<string, RecoveryStage> = {};
    for (const client of metrics.recoveryList) {
      if (client.recovery_status) {
        savedStages[client.email] = client.recovery_status;
      }
    }
    // Only update if we have saved stages to prevent overwriting local changes
    if (Object.keys(savedStages).length > 0) {
      setStages(prev => ({ ...savedStages, ...prev }));
    }
  }
}, [metrics.recoveryList]);
```

---

### 3. Modificar `RecoveryPage.tsx` - Escritura (Update)

**Archivo**: `src/components/dashboard/RecoveryPage.tsx`

**Cambio**: Modificar la función `setStage` para:
1. Actualizar el estado local (ya lo hace)
2. Guardar `recovery_status` en `customer_metadata` JSONB de la tabla `clients`
3. Mostrar indicador de carga y toast de confirmación

**Antes (función `setStage`, líneas 105-127)**:
```typescript
const setStage = async (email: string, stage: RecoveryStage) => {
  setStages(prev => ({ ...prev, [email]: stage }));
  
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('email', email)
      .single();
    
    if (client) {
      await supabase.from('client_events').insert({...});
    }
  } catch (e) {...}
  
  toast.success(`Estado actualizado a: ${stageConfig[stage].label}`);
};
```

**Después**:
```typescript
const [savingStage, setSavingStage] = useState<string | null>(null);

const setStage = async (email: string, stage: RecoveryStage) => {
  // Optimistic update
  setStages(prev => ({ ...prev, [email]: stage }));
  setSavingStage(email);
  
  try {
    // Fetch client and current metadata
    const { data: client } = await supabase
      .from('clients')
      .select('id, customer_metadata')
      .eq('email', email)
      .single();
    
    if (client) {
      // Merge recovery_status into existing metadata
      const currentMetadata = (client.customer_metadata as Record<string, unknown>) || {};
      const updatedMetadata = {
        ...currentMetadata,
        recovery_status: stage,
        recovery_status_updated_at: new Date().toISOString(),
      };
      
      // Save to database
      const { error } = await supabase
        .from('clients')
        .update({ customer_metadata: updatedMetadata })
        .eq('id', client.id);
      
      if (error) throw error;
      
      // Log event (existing logic)
      await supabase.from('client_events').insert({
        client_id: client.id,
        event_type: 'custom',
        metadata: { action: 'recovery_stage_change', stage, timestamp: new Date().toISOString() },
      });
      
      toast.success(`Estado guardado: ${stageConfig[stage].label}`);
    } else {
      toast.warning('Cliente no encontrado en la base de datos');
    }
  } catch (e) {
    console.error('Error saving recovery status:', e);
    // Revert optimistic update on error
    setStages(prev => {
      const newStages = { ...prev };
      delete newStages[email];
      return newStages;
    });
    toast.error('Error guardando el estado');
  } finally {
    setSavingStage(null);
  }
};
```

---

### 4. UI: Indicador de Guardado

**Archivo**: `src/components/dashboard/RecoveryPage.tsx`

**Cambio**: Mostrar un pequeño `Loader2` cuando se está guardando el estado de un cliente específico.

**En el Badge del dropdown (líneas ~421-436)**:
```typescript
<Badge 
  variant="outline" 
  className={`cursor-pointer text-[10px] px-1 h-4 shrink-0 ${config.color}`}
>
  {savingStage === client.email ? (
    <Loader2 className="h-2 w-2 mr-0.5 animate-spin" />
  ) : (
    <StageIcon className="h-2 w-2 mr-0.5" />
  )}
  {config.label}
</Badge>
```

---

## Flujo de Datos Post-Implementación

```text
┌─────────────────────────────────────────────────────────────────────┐
│                     FLUJO DE PERSISTENCIA                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. CARGA INICIAL (Fetch)                                           │
│     ┌───────────────────┐                                           │
│     │   useMetrics()    │                                           │
│     │   fetchMetrics()  │                                           │
│     └─────────┬─────────┘                                           │
│               │                                                     │
│               ▼                                                     │
│     SELECT email, full_name, phone, customer_metadata               │
│     FROM clients WHERE email IN (failed_emails)                     │
│               │                                                     │
│               ▼                                                     │
│     Extrae recovery_status de customer_metadata                     │
│               │                                                     │
│               ▼                                                     │
│     RecoveryPage: setStages({ email: status, ... })                 │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  2. CAMBIO DE ESTADO (Update)                                       │
│     ┌───────────────────┐                                           │
│     │ Usuario cambia    │                                           │
│     │ estado a "Pagó"   │                                           │
│     └─────────┬─────────┘                                           │
│               │                                                     │
│               ▼                                                     │
│     setStage(email, 'paid')                                         │
│        ├─ Optimistic: setStages(local)                              │
│        ├─ DB: UPDATE clients SET customer_metadata = {...}          │
│        ├─ Log: INSERT INTO client_events                            │
│        └─ Toast: "Estado guardado: Pagó"                            │
│                                                                     │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                     │
│  3. RECARGA DE PÁGINA                                               │
│     ┌───────────────────┐                                           │
│     │  Usuario recarga  │  →  useMetrics() →  Estados preservados   │
│     │     (F5/Refresh)  │                                           │
│     └───────────────────┘                                           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `src/hooks/useMetrics.ts` | Incluir `customer_metadata` en query, extraer `recovery_status` |
| `src/components/dashboard/RecoveryPage.tsx` | Cargar estados guardados, persistir cambios a DB |

---

## Consideraciones Técnicas

1. **Deep Merge de Metadata**: Usamos spread operator para preservar otros datos en `customer_metadata`
2. **Optimistic Updates**: UI se actualiza inmediatamente, revierte si falla la DB
3. **Compatibilidad**: Clientes sin `recovery_status` guardado aparecen como `pending` (comportamiento actual)
4. **No requiere migración**: Usa campo JSONB existente

---

## Testing Post-Implementación

1. Cambiar el estado de un deudor de "Pendiente" a "Contactado"
2. Verificar que aparece el toast "Estado guardado: Contactado"
3. Recargar la página (F5)
4. Confirmar que el deudor sigue apareciendo como "Contactado"
5. Verificar en la base de datos que `customer_metadata.recovery_status = 'contacted'`

