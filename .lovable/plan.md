
# Plan: Configuración Perfecta de Webhook GoHighLevel → unify-identity

## Resumen del Problema

GoHighLevel (GHL) tiene un sistema de webhooks que envía datos cuando se crea o actualiza un contacto. Necesitamos configurarlo correctamente para que toda la data llegue sin errores a nuestro sistema.

## La Solución: 2 Opciones

### Opción A: Endpoint Dedicado (RECOMENDADO)
Crear un endpoint `ghl-webhook` que:
1. Reciba el formato nativo de GHL sin modificaciones
2. Transforme automáticamente los datos
3. Llame internamente a `unify-identity`
4. Verifique la firma del webhook (seguridad)

### Opción B: Usar unify-identity directamente
Requiere configurar el body manualmente en GHL (más complejo, propenso a errores)

---

## Implementación Recomendada: Endpoint `ghl-webhook`

### Estructura del Webhook de GHL

Cuando GHL envía un webhook de "ContactCreate", el payload viene así:

```json
{
  "type": "ContactCreate",
  "locationId": "kIG3EUjfgGLoNW0QsJLS",
  "id": "abc123xyz",
  "email": "cliente@email.com",
  "phone": "+15551234567",
  "firstName": "Juan",
  "lastName": "Pérez",
  "name": "juan pérez",
  "tags": ["lead", "facebook"],
  "source": "facebook",
  "dnd": false,
  "dndSettings": {
    "sms": { "status": "inactive" },
    "email": { "status": "inactive" },
    "whatsApp": { "status": "inactive" }
  },
  "attributionSource": {
    "sessionSource": "facebook",
    "medium": "paid",
    "campaign": "promo_enero"
  },
  "customFields": [
    { "id": "field_id", "value": "valor" }
  ],
  "dateAdded": "2026-01-27T19:30:00.000Z"
}
```

### Archivo a Crear: `supabase/functions/ghl-webhook/index.ts`

```text
┌─────────────────────────────────────────────────────────────────┐
│                     GHL-WEBHOOK FLOW                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   GoHighLevel                                                   │
│       │                                                         │
│       ▼                                                         │
│   POST /ghl-webhook                                             │
│       │                                                         │
│       ├─► 1. Verificar x-wh-signature (seguridad)               │
│       │                                                         │
│       ├─► 2. Detectar tipo de evento:                           │
│       │      - ContactCreate                                    │
│       │      - ContactUpdate                                    │
│       │      - ContactDelete (ignorar)                          │
│       │                                                         │
│       ├─► 3. Transformar payload GHL → formato unify-identity   │
│       │                                                         │
│       ├─► 4. Llamar RPC unify_identity                          │
│       │                                                         │
│       └─► 5. Responder 200 OK (siempre, para evitar retries)    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Lógica de Transformación

| Campo GHL | Campo unify-identity |
|-----------|---------------------|
| `id` | `ghl_contact_id` |
| `email` | `email` |
| `phone` | `phone` |
| `firstName` + `lastName` | `full_name` |
| `tags` | `tags` |
| `attributionSource.sessionSource` | `utm_source` |
| `attributionSource.medium` | `utm_medium` |
| `attributionSource.campaign` | `utm_campaign` |
| `!dnd && dndSettings.sms.status !== 'active'` | `sms_opt_in` |
| `!dnd && dndSettings.whatsApp.status !== 'active'` | `wa_opt_in` |
| `!dnd && dndSettings.email.status !== 'active'` | `email_opt_in` |
| `customFields` | `custom_fields` (transformado a objeto) |
| `source` | `metadata.ghl_source` |
| `dateAdded` | `metadata.ghl_date_added` |

---

## Configuración en GoHighLevel

### Paso 1: Ir a Settings → Integrations → Webhooks

### Paso 2: Crear Nuevo Webhook

```text
┌─────────────────────────────────────────────────────────────────┐
│ GoHighLevel Webhook Configuration                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Name: CRM Sync - Contact Created                                │
│                                                                 │
│ URL:                                                            │
│ https://sbexeqqizazjfsbsgrbd.supabase.co/functions/v1/ghl-webhook│
│                                                                 │
│ Events:                                                         │
│   ☑ ContactCreate                                               │
│   ☑ ContactUpdate                                               │
│   ☐ ContactDelete                                               │
│   ☐ OpportunityCreate                                           │
│   ☐ ... (otros eventos)                                         │
│                                                                 │
│ No se necesitan headers adicionales - GHL firma automáticamente │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Actualización de supabase/config.toml

```toml
[functions.ghl-webhook]
verify_jwt = false  # Los webhooks de GHL no usan JWT, usan firma
```

---

## Seguridad: Verificación de Firma

GHL firma cada webhook con una clave pública RSA. El endpoint verificará:

1. Header `x-wh-signature` presente
2. Decodificar con la clave pública de GHL
3. Comparar con el payload recibido
4. Rechazar si no coincide

---

## Eventos Soportados

| Evento | Acción |
|--------|--------|
| `ContactCreate` | Crear o unificar cliente en `clients` |
| `ContactUpdate` | Actualizar cliente existente |
| `ContactDelete` | Loguear pero no eliminar (soft delete) |
| `ContactDndUpdate` | Actualizar opt-ins de canales |

---

## Beneficios de Esta Implementación

1. **Zero configuración en GHL**: Solo pegar la URL
2. **Transformación automática**: No hay que mapear campos manualmente
3. **Seguridad**: Verificación de firma
4. **Resiliente**: Siempre responde 200 para evitar reintentos infinitos
5. **Logging completo**: Cada evento queda registrado
6. **Compatible**: Mismo RPC `unify_identity` que ya probamos con ManyChat

---

## Archivos a Crear/Modificar

| Archivo | Acción |
|---------|--------|
| `supabase/functions/ghl-webhook/index.ts` | CREAR - Endpoint dedicado |
| `supabase/config.toml` | MODIFICAR - Añadir configuración |

---

## Resultado Final

Una vez implementado:

1. Vas a GHL → Settings → Webhooks
2. Creas un webhook con la URL del endpoint
3. Seleccionas eventos `ContactCreate` y `ContactUpdate`
4. Guardas
5. Cada contacto nuevo/actualizado llega automáticamente a tu CRM

No necesitas configurar headers, body, ni nada más. El endpoint se encarga de todo.
