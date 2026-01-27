
# Plan de Correcciones: Sincronización Basada en Documentación Oficial

## Diagnóstico de Problemas Encontrados

Tras revisar la documentación oficial de cada API y los logs recientes, identifiqué **3 problemas críticos**:

### Problema 1: GHL - Código Viejo Desplegado
Los logs muestran que el código **todavía usa** `startAfterId` como parámetro separado:
```
Using startAfterId for pagination | startAfterId="7xGUYPBgMcfbTQKSBOf6"
```
Pero según la documentación oficial de GHL API v2, el parámetro correcto es `searchAfter: [timestamp, id]` como array.

**Causa**: El diff anterior modificó el código, pero los logs muestran que todavía se está loggeando incorrectamente, lo que indica que hay mensajes de log desactualizados o una versión anterior del código corriendo.

### Problema 2: GHL - Constraint de Base de Datos Incorrecto
```
Error upserting raw contacts batch | error=there is no unique or exclusion constraint matching the ON CONFLICT specification
```
- El código usa: `onConflict: 'external_id'`
- La tabla tiene: `UNIQUE (external_id, fetched_at)` - constraint compuesto
- **Conflicto**: El upsert no funciona porque el constraint es compuesto

### Problema 3: ManyChat - Mismo Problema de Constraint
- El código usa: `onConflict: 'subscriber_id'`
- La tabla tiene: `UNIQUE (subscriber_id, fetched_at)` - constraint compuesto

---

## Correcciones Requeridas

### 1. Base de Datos: Agregar Constraints UNIQUE Simples

Crear constraints únicos en columnas individuales:

```sql
-- GHL: Agregar constraint único solo en external_id
ALTER TABLE ghl_contacts_raw 
DROP CONSTRAINT IF EXISTS ghl_contacts_raw_external_id_key;

ALTER TABLE ghl_contacts_raw 
ADD CONSTRAINT ghl_contacts_raw_external_id_key UNIQUE (external_id);

-- ManyChat: Agregar constraint único solo en subscriber_id
ALTER TABLE manychat_contacts_raw 
DROP CONSTRAINT IF EXISTS manychat_contacts_raw_subscriber_id_key;

ALTER TABLE manychat_contacts_raw 
ADD CONSTRAINT manychat_contacts_raw_subscriber_id_key UNIQUE (subscriber_id);
```

### 2. sync-ghl: Limpiar Logs y Verificar Código

El código actual **ya tiene la corrección** de `searchAfter`, pero los mensajes de log son confusos. Ajustar:

```typescript
// Línea 81-84 - Actualizar mensaje de log
logger.info('Fetching GHL contacts (STAGE ONLY MODE)', { 
  hasSearchAfter: !!(startAfter && startAfterId),
  searchAfterArray: startAfter && startAfterId ? [startAfter, startAfterId] : null,
  limit: CONTACTS_PER_PAGE 
});
```

### 3. sync-ghl: Fallback a INSERT si UPSERT Falla

Como precaución adicional, agregar fallback:

```typescript
// Si el upsert falla por constraint, intentar delete + insert
const { error: upsertError } = await supabase
  .from('ghl_contacts_raw')
  .upsert(rawRecords, { onConflict: 'external_id', ignoreDuplicates: false });

if (upsertError && upsertError.message.includes('ON CONFLICT')) {
  // Fallback: Eliminar y reinsertar
  const externalIds = rawRecords.map(r => r.external_id);
  await supabase.from('ghl_contacts_raw').delete().in('external_id', externalIds);
  await supabase.from('ghl_contacts_raw').insert(rawRecords);
}
```

---

## Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| **Migración SQL** | Agregar constraints UNIQUE simples |
| `sync-ghl/index.ts` | Limpiar logs, agregar fallback |
| `sync-manychat/index.ts` | Agregar fallback para upsert |

---

## Resumen de Documentación Oficial Verificada

| API | Parámetro Paginación | Formato | Límite |
|-----|---------------------|---------|--------|
| **GHL v2 Search** | `searchAfter` | `[timestamp, contactId]` | 100/página |
| **Stripe** | `starting_after` | ID del último objeto | 100/página |
| **PayPal Transactions** | `page`, `page_size` | Números enteros | 500/página, 31 días máx |
| **ManyChat** | `findBySystemField` | Búsqueda individual | 1 por request |

---

## Orden de Ejecución

1. Aplicar migración SQL para agregar constraints
2. Actualizar `sync-ghl` con logs limpios y fallback
3. Actualizar `sync-manychat` con fallback
4. Redesplegar Edge Functions
5. Limpiar sync_runs bloqueados
6. Probar sincronización

Esto resolverá los errores de `ON CONFLICT` y asegurará que la paginación de GHL funcione correctamente según la documentación oficial.
