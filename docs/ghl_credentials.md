# GoHighLevel Integration Runbook

Este documento describe la integración con GoHighLevel sin exponer secretos.

## Política de Seguridad
- No guardar tokens en archivos `.md`, código fuente o commits.
- Configurar secretos solo en el proveedor de runtime (Supabase/Lovable).
- Si un token se expuso, rotarlo inmediatamente.

## Secretos Requeridos
- `GHL_API_KEY`
- `GHL_LOCATION_ID`

## API Base
- Base URL: `https://services.leadconnectorhq.com`
- Contact search: `POST /contacts/search`
- Headers mínimos:
- `Authorization: Bearer <GHL_API_KEY>`
- `Version: 2021-07-28`
- `Content-Type: application/json`

## Payload Base Recomendado
```json
{
  "locationId": "<GHL_LOCATION_ID>",
  "pageLimit": 100,
  "startAfterId": "<optional_contact_id>"
}
```

## Notas de Datos
- Muchos contactos pueden venir sin `email` y sin `phone`.
- La paginación práctica usa `startAfterId`/cursor según respuesta.
- No asumir `hasMore`; validar longitud de página y cursor devuelto.

## Checklist Operativo
1. Verificar secretos cargados en entorno.
2. Ejecutar request de prueba contra `/contacts/search`.
3. Confirmar mapeo de campos críticos (`id`, `email`, `phone`, `tags`).
4. Validar rate-limit antes de ejecutar sync masivo.

## Rotación de Secretos
1. Generar nuevo token en GHL.
2. Actualizar `GHL_API_KEY` en entorno.
3. Redeploy de funciones que lo consumen.
4. Revocar token anterior.
