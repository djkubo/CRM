# Guía Canónica: Conexión a Supabase

Esta es la guía única vigente para conexión a Supabase en este repositorio.

## Credenciales Necesarias
- `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (opcional)

## Dónde Obtenerlas
1. Lovable Cloud -> Project -> Settings -> Environment Variables.
2. O Supabase Dashboard -> Settings -> API.

## Configuración Local
En `.env.local`:
```env
VITE_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
VITE_SUPABASE_PUBLISHABLE_KEY=<anon_or_publishable_key>
```

## Verificación Rápida
1. Instalar dependencias: `npm install`
2. Ejecutar app: `npm run dev`
3. Validar build: `npm run build`

Si la app levanta y build pasa, las variables base están correctas.

## Buenas Prácticas
- Nunca subir `.env*` con secretos.
- No pegar secretos en tickets/chats/docs.
- Rotar `SERVICE_ROLE_KEY` si hubo exposición.
- Mantener secretos solo en plataformas de runtime.

## Documentos Relacionados
- `docs/database_backup_strategy.md`
- `docs/archive/pasos_conexion_supabase.md` (histórico)
- `docs/archive/obtener_credenciales_rapido.md` (histórico)
