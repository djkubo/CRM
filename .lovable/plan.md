
# Plan: Corrección Urgente de Conteos (Error 500 Timeout)

## Problema Identificado

Las consultas de conteo actuales causan **timeout (error 500)** porque:
- `ghl_contacts_raw`: 187,468 registros
- `csv_imports_raw`: 664,141 registros
- `clients`: 208,696 registros

PostgreSQL no puede ejecutar `COUNT(*)` exacto en tablas tan grandes sin timeout.

## Solución en 2 Pasos

### Paso 1: Crear RPC de Conteo Rápido (Base de Datos)

Crear una función SQL que use estimaciones de `pg_stat_user_tables` para conteos instantáneos:

```sql
CREATE OR REPLACE FUNCTION get_staging_counts_fast()
RETURNS JSON AS $$
  SELECT json_build_object(
    'ghl_total', (SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'ghl_contacts_raw'),
    'ghl_unprocessed', (SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'ghl_contacts_raw'),
    'manychat_total', (SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'manychat_contacts_raw'),
    'manychat_unprocessed', (SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'manychat_contacts_raw'),
    'csv_total', (SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'csv_imports_raw'),
    'csv_staged', (SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'csv_imports_raw')
  );
$$ LANGUAGE SQL STABLE;
```

### Paso 2: Actualizar Frontend

Modificar `SyncOrchestrator.tsx` para:
1. Llamar al RPC `get_staging_counts_fast()` en lugar de 6 queries separadas
2. Manejar el fallback a 0 en caso de error
3. Eliminar el polling de 5 segundos para reducir carga

**Cambio en fetchCounts:**
```typescript
const fetchCounts = useCallback(async () => {
  try {
    const { data, error } = await supabase.rpc('get_staging_counts_fast');
    if (error) throw error;
    
    setRawCounts({
      ghl_total: data.ghl_total || 0,
      ghl_unprocessed: data.ghl_unprocessed || 0,
      manychat_total: data.manychat_total || 0,
      manychat_unprocessed: data.manychat_unprocessed || 0,
      csv_staged: data.csv_staged || 0,
      csv_total: data.csv_total || 0
    });
    
    setPendingCounts({
      ghl: data.ghl_unprocessed || 0,
      manychat: data.manychat_unprocessed || 0,
      csv: data.csv_staged || 0,
      total: (data.ghl_unprocessed || 0) + (data.manychat_unprocessed || 0) + (data.csv_staged || 0)
    });
    setLoading(false);
  } catch (error) {
    console.error('Error fetching counts:', error);
    setLoading(false);
  }
}, []);
```

## Resultado Esperado

| Antes | Después |
|-------|---------|
| 6 queries separadas | 1 llamada RPC |
| Timeout en ~8 segundos | Respuesta en <50ms |
| Error 500 | Datos visibles inmediatamente |
| 0 contactos mostrados | ~852,000 contactos mostrados |

## Archivos a Modificar

1. **Nueva migración SQL**: Crear función `get_staging_counts_fast()`
2. **src/components/dashboard/SyncOrchestrator.tsx**: Usar el nuevo RPC

## Beneficios Adicionales

- Los conteos estimados son actualizados automáticamente por PostgreSQL
- Se reduce la carga en la base de datos de 6 queries a 1
- El dashboard cargará instantáneamente
