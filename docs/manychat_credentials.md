# ManyChat Integration Runbook

Este documento cubre la integración con ManyChat sin exponer credenciales.

## Política de Seguridad
- No guardar API keys en repositorio.
- Usar secretos en runtime.
- Rotar keys si hubo exposición.

## Secreto Requerido
- `MANYCHAT_API_KEY`

## API Base
- Base URL: `https://api.manychat.com`
- Auth: `Authorization: Bearer <MANYCHAT_API_KEY>`

## Endpoints Usados
1. Buscar por email (actual):
- `GET /fb/subscriber/findBySystemField?field_name=email&field_value={email}`

2. Consultar por subscriber ID:
- `GET /fb/subscriber/getInfo?subscriber_id={id}`

## Estructura de Datos Esperada
- `id`
- `email`
- `phone`
- `first_name` / `last_name`
- `tags`
- `optin_email` / `optin_sms` / `optin_whatsapp`

## Riesgos Operativos
- La búsqueda 1:1 por email es costosa para lotes grandes.
- Puede haber rate-limit en syncs masivos.

## Recomendaciones de Rendimiento
1. Batch interno por páginas/chunks.
2. Retry con backoff para 429.
3. Cache temporal para emails ya consultados.
4. Métrica de throughput (req/min y match rate).

## Checklist Operativo
1. Confirmar secreto en entorno.
2. Probar endpoint con 1 email real.
3. Verificar mapeo a `manychat_subscriber_id`.
4. Ejecutar sync en lote pequeño antes de lote grande.
