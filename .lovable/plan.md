

# Plan: Corregir Bug en función unify_identity

## Problema Identificado

El error **NO ES** de caché ni de permisos. Es un **bug lógico** en la función `unify_identity`:

```
Error: record "v_existing_client" is not assigned yet
SQLSTATE: 55000
```

### Causa Raíz

Cuando `p_source` no es "stripe", "paypal", "ghl", o "manychat", la función salta directamente a la búsqueda por email (línea 59). Sin embargo, el check `IF v_existing_client.id IS NULL` en la línea 59 falla porque el record nunca fue inicializado.

```sql
-- Línea 59: ESTO FALLA si no se ejecutó ningún SELECT INTO previo
IF v_existing_client.id IS NULL AND v_email_normalized IS NOT NULL THEN
```

Tu script Python envía `p_source: "test_script"` que no matchea ningún caso, causando el crash.

---

## Solución

Modificar la función `unify_identity` para inicializar `v_existing_client` a NULL al inicio:

```sql
-- Agregar después de la declaración de variables (línea ~16)
v_existing_client := NULL;
```

O mejor, usar `FOUND` en lugar de verificar el record:

```sql
-- Cambiar la lógica de verificación
IF NOT FOUND AND v_email_normalized IS NOT NULL THEN
  SELECT * INTO v_existing_client FROM clients 
  WHERE lower(trim(email)) = v_email_normalized LIMIT 1;
END IF;
```

---

## Pasos de Implementación

### Paso 1: Actualizar función unify_identity
Agregar inicialización explícita del record al inicio del bloque BEGIN:
```sql
v_existing_client := NULL;
```

Y cambiar las verificaciones de `v_existing_client.id IS NULL` a usar `v_existing_client IS NULL` o la variable `FOUND`.

### Paso 2: Agregar fallback para fuentes desconocidas
Si el source no es conocido, buscar directamente por email/teléfono sin esperar match por ID externo.

### Paso 3: Recargar caché
Ejecutar `NOTIFY pgrst, 'reload schema'` después del fix.

---

## Archivos a Modificar

| Archivo | Acción |
|---------|--------|
| Nueva migración SQL | `CREATE OR REPLACE FUNCTION unify_identity(...)` con el fix |

---

## Verificación de la Solución

```sql
-- Antes del fix: FALLA
SELECT unify_identity_v2('test_script', 'ghl123', NULL, 'test@example.com', '+1555000', 'Test User', '{}'::jsonb);

-- Después del fix: FUNCIONA
-- Retorna: {"success": true, "client_id": "uuid-aqui", "action": "created"}
```

---

## Código Corregido (Vista Previa)

```sql
CREATE OR REPLACE FUNCTION public.unify_identity(...)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email_normalized text;
  v_phone_e164 text;
  v_client_id uuid;
  v_action text := 'none';
  v_existing_client record;  -- Será NULL por defecto
  v_match_by text;
  v_wa_opt_in boolean;
  v_sms_opt_in boolean;
  v_email_opt_in boolean;
  v_found boolean := false;  -- NUEVO: flag para tracking
BEGIN
  -- Normalize inputs
  v_email_normalized := normalize_email(p_email);
  v_phone_e164 := normalize_phone_e164(p_phone);
  
  -- Parse opt-in flags
  v_wa_opt_in := COALESCE((p_opt_in->>'wa_opt_in')::boolean, false);
  v_sms_opt_in := COALESCE((p_opt_in->>'sms_opt_in')::boolean, false);
  v_email_opt_in := COALESCE((p_opt_in->>'email_opt_in')::boolean, true);

  -- BÚSQUEDA POR ID EXTERNO (solo si source coincide)
  IF p_source = 'stripe' AND p_stripe_customer_id IS NOT NULL THEN
    SELECT * INTO v_existing_client FROM clients 
    WHERE stripe_customer_id = p_stripe_customer_id LIMIT 1;
    v_found := FOUND;
    IF v_found THEN v_match_by := 'stripe_customer_id'; END IF;
  ELSIF p_source = 'paypal' AND p_paypal_customer_id IS NOT NULL THEN
    SELECT * INTO v_existing_client FROM clients 
    WHERE paypal_customer_id = p_paypal_customer_id LIMIT 1;
    v_found := FOUND;
    IF v_found THEN v_match_by := 'paypal_customer_id'; END IF;
  ELSIF p_source = 'ghl' AND p_ghl_contact_id IS NOT NULL THEN
    SELECT * INTO v_existing_client FROM clients 
    WHERE ghl_contact_id = p_ghl_contact_id LIMIT 1;
    v_found := FOUND;
    IF v_found THEN v_match_by := 'ghl_contact_id'; END IF;
  ELSIF p_source = 'manychat' AND p_manychat_subscriber_id IS NOT NULL THEN
    SELECT * INTO v_existing_client FROM clients 
    WHERE manychat_subscriber_id = p_manychat_subscriber_id LIMIT 1;
    v_found := FOUND;
    IF v_found THEN v_match_by := 'manychat_subscriber_id'; END IF;
  END IF;
  
  -- BÚSQUEDA POR EMAIL (si no encontramos por ID externo)
  IF NOT v_found AND v_email_normalized IS NOT NULL THEN
    SELECT * INTO v_existing_client FROM clients 
    WHERE lower(trim(email)) = v_email_normalized LIMIT 1;
    v_found := FOUND;
    IF v_found THEN v_match_by := 'email'; END IF;
  END IF;
  
  -- BÚSQUEDA POR TELÉFONO (si no hay match previo)
  IF NOT v_found AND v_phone_e164 IS NOT NULL THEN
    SELECT * INTO v_existing_client FROM clients 
    WHERE phone_e164 = v_phone_e164 OR phone = v_phone_e164 LIMIT 1;
    v_found := FOUND;
    IF v_found THEN v_match_by := 'phone'; END IF;
  END IF;

  -- RESTO DE LA LÓGICA (crear/actualizar)
  IF v_found THEN
    v_client_id := v_existing_client.id;
    v_action := 'updated';
    -- ... UPDATE logic ...
  ELSE
    v_action := 'created';
    -- ... INSERT logic ...
  END IF;
  
  -- ...
END;
$$;
```

---

## Resultado Esperado

Después de aplicar este fix:
1. Tu script Python funcionará con cualquier valor de `p_source`
2. La función creará nuevos clientes cuando no existan
3. Actualizará clientes existentes cuando los encuentre por email/teléfono/ID

