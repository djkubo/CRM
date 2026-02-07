# Auditoria UX/UI (Admin Hub)

Fecha: 2026-02-07

Objetivo: estabilizar la app (sin pantallas bloqueantes por config), homogeneizar idioma (ES), y llevar cada ruta a un estandar CRM "pro": estados vacios/carga/error, accesibilidad, microcopy consistente y una navegacion predecible.

## Cambios Aplicados (Esta Iteracion)

- Arranque: se elimino el bloqueo por "Falta configuracion" para Supabase y se reforzo el cliente para usar `env` (con fallback). Ver:
  - `src/App.tsx`
  - `src/integrations/supabase/client.ts`
- Navegacion/Copy:
  - Sidebar: "Centro de Comando", "Importar / Sincronizar", traducciones varias.
  - Header: boton de notificaciones con `aria-label` y "Sincronizar".
  - Rutas clave: encabezados pasados a `text-foreground` y strings obvios a ES (facturas/suscripciones/import/sync).
- UX bug real: en `ImportSyncPage` habia `xs:` (breakpoint inexistente) dejando el tab con texto roto. Se corrigio.
- 404: pagina NotFound ahora es consistente con el tema y esta en ES.
- Logout: sidebar + ajustes ahora cierran sesion realmente y redirigen a `/login` con toast.

## Inventario De Rutas (App.tsx)

Protegidas (requieren sesion):
- `/` Centro de Comando (DashboardHome)
- `/movements` Movimientos
- `/analytics` Analitica
- `/messages` Mensajes
- `/campaigns` Campanas
- `/broadcast` Difusion
- `/flows` Automatizaciones
- `/whatsapp` WhatsApp Directo
- `/clients` Clientes
- `/invoices` Facturas
- `/subscriptions` Suscripciones
- `/recovery` Revenue Ops / Recuperacion (pipeline)
- `/import` Importar / Sincronizar
- `/diagnostics` Diagnostico
- `/settings` Ajustes

Publicas:
- `/login`
- `/install`
- `/update-card`
- `/update-card/success`
- `*` 404

## Hallazgos Y Backlog (Prioridad)

P0 (rompe experiencia / bloquea operacion)
- Service Worker/PWA puede servir builds viejos: ya se configuro `skipWaiting` + `clientsClaim`, pero falta UX dentro de la app para forzar refresh cuando hay update disponible.
- Dependencia de env en deploy: ya no bloquea el arranque; aun asi se recomienda mostrar diagnostico no-bloqueante (banner en `/diagnostics` o `/settings`) si la conexion a Supabase falla.

P1 (CRM-grade: claridad, consistencia, control)
- Copys mezclados ES/EN: aun quedan strings (por ejemplo "Smart Recovery", partes de analytics, tooltips). Definir glosario:
  - "Prueba" vs "Trial"
  - "Bajas" vs "Churn"
  - "Reactivacion" vs "Winback"
  - "Centro de Comando" como nombre canonico
- Accesibilidad:
  - Botones icon-only deben tener `aria-label` (notificaciones/logouts ok; faltan mas).
  - Formularios: labels/errores consistentes y foco visible.
  - Tablas: navegacion por teclado + encabezados claros.
- Estados de UI:
  - Cada ruta debe tener: loading (skeleton), empty state (con CTA), error state (con "Reintentar" y detalle tecnico ocultable).
- Tablas (Clientes/Facturas/Suscripciones):
  - Orden, filtros persistentes, columnas configurables, acciones bulk, export consistente.
  - Paginacion con "mostrar 50/100/200" ok, pero falta recordar preferencia del usuario.

P2 (polish + performance)
- Tokens vs hardcodes: hay mucho `bg-zinc-*`/`text-white` en componentes. Migrar gradualmente a tokens (`bg-card`, `text-foreground`, `border-border`) para consistencia y futura tematizacion.
- Bundle: `index` sigue >500kb minificado. Ya hay `manualChunks`; siguiente paso es lazy-load de charts y flows cuando no se usan.
- Observabilidad:
  - Log de errores de edge functions y fallas de sync en una vista unica (ideal: timeline de incidentes en `/diagnostics`).

## Propuesta De Siguiente Iteracion (Recomendada)

1. UX de updates PWA: modal/banner "Nueva version disponible" + boton "Actualizar ahora".
2. Normalizar copys ES en:
   - `/messages`, `/campaigns`, `/broadcast`, `/flows`
3. Accesibilidad rapida:
   - `aria-label` para todos los icon buttons, y focus rings consistentes.
4. Estados vacios + CTA por ruta (clientes/ facturas / suscripciones / mensajes).

