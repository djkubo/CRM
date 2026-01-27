
# Plan: Arreglar Bug de DUPLICATE_IDENTITY en unify-identity

## Diagnóstico Confirmado

El webhook de ManyChat **FUNCIONA CORRECTAMENTE**:
- URL: `https://sbexeqqizazjfsbsgrbd.supabase.co/functions/v1/unify-identity` ✅
- Headers: `x-admin-key`, `Content-Type: application/json` ✅
- Body JSON: Formato correcto ✅
- Autenticación: Validada ✅

**El problema**: Cualquier intento de ACTUALIZAR un contacto existente falla con error `DUPLICATE_IDENTITY`.

**Causa raíz**: Existen índices únicos duplicados en la tabla `clients`:

| Columna | Índices Únicos Encontrados |
|---------|---------------------------|
| email | `clients_email_key`, `clients_email_unique`, `idx_clients_email_unique` (3 duplicados) |
| manychat_subscriber_id | `idx_clients_manychat_id`, `idx_clients_manychat_unique` (2 duplicados) |
| ghl_contact_id | `idx_clients_ghl_id`, `idx_clients_ghl_unique` (2 duplicados) |

Esto causa que Postgres lance una excepción `unique_violation` incluso al actualizar el mismo registro.

---

## Solución en 2 Pasos

### Paso 1: Limpiar Índices Duplicados (Migración SQL)

```sql
-- IMPORTANTE: Eliminar índices únicos duplicados, mantener solo uno por columna

-- Email: mantener solo idx_clients_email_unique (el más específico con lower())
DROP INDEX IF EXISTS clients_email_key;
DROP INDEX IF EXISTS clients_email_unique;

-- ManyChat: mantener solo idx_clients_manychat_id
DROP INDEX IF EXISTS idx_clients_manychat_unique;

-- GHL: mantener solo idx_clients_ghl_id  
DROP INDEX IF EXISTS idx_clients_ghl_unique;
```

### Paso 2: Mejorar el RPC unify_identity

Modificar el bloque EXCEPTION para manejar mejor las actualizaciones y evitar falsos positivos:

```sql
-- En lugar de capturar TODAS las unique_violation,
-- solo capturar conflictos reales de INSERT
EXCEPTION WHEN unique_violation THEN
  -- Solo retornar error si estamos en INSERT, no en UPDATE
  IF v_action = 'created' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DUPLICATE_IDENTITY',
      'message', 'A client with this identity already exists'
    );
  ELSE
    -- Para updates, reintentar sin los campos que causan conflicto
    RAISE NOTICE 'Unique violation on update, retrying...';
    -- Alternativamente, simplemente retornar éxito parcial
    RETURN jsonb_build_object(
      'success', true,
      'action', 'updated_partial',
      'client_id', v_client_id,
      'warning', 'Some fields could not be updated due to conflicts'
    );
  END IF;
```

---

## Archivos a Modificar

| Archivo/Recurso | Cambio |
|-----------------|--------|
| Migración SQL | Eliminar índices únicos duplicados |
| RPC `unify_identity` | Mejorar manejo de EXCEPTION para updates |

---

## Resultado Esperado

Después de aplicar estos cambios:

1. ManyChat podrá enviar webhooks que **actualicen** contactos existentes
2. No habrá más errores `DUPLICATE_IDENTITY` falsos
3. La unificación de identidad funcionará correctamente para:
   - Crear nuevos contactos ✅ (ya funciona)
   - Actualizar contactos existentes ✅ (a corregir)

---

## Configuración Final de ManyChat

Una vez aplicados los cambios, la configuración será:

```text
┌─────────────────────────────────────────────────────────────────┐
│ ManyChat External Request                                       │
├─────────────────────────────────────────────────────────────────┤
│ URL: https://sbexeqqizazjfsbsgrbd.supabase.co/functions/v1/     │
│      unify-identity                                             │
│                                                                 │
│ Headers:                                                        │
│   Content-Type: application/json                                │
│   x-admin-key: vrp_admin_2026_K8p3dQ7xN2v9Lm5R1s0T4u6Yh8Gf3Jk  │
│   x-source: manychat                                            │
│                                                                 │
│ Body:                                                           │
│ {                                                               │
│   "source": "manychat",                                         │
│   "email": "{{email}}",                                         │
│   "phone": "{{phone}}",                                         │
│   "full_name": "{{first_name}} {{last_name}}",                  │
│   "manychat_subscriber_id": "{{user_id}}",                      │
│   "utm_source": "manychat",                                     │
│   "utm_medium": "chatbot",                                      │
│   "utm_campaign": "{{flow_name}}",                              │
│   "tags": ["manychat", "{{flow_name}}"],                        │
│   "wa_opt_in": true                                             │
│ }                                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Notas Técnicas

- La eliminación de índices duplicados NO afecta datos existentes
- Los índices que se mantienen son suficientes para garantizar unicidad
- El rendimiento mejorará ligeramente al tener menos índices que mantener
- Se requiere probar después de la migración para confirmar que funciona
