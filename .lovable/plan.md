
# Fase 5: Grupos y Comunidades WhatsApp

## Análisis de Viabilidad

### Limitaciones Importantes

La gestión de grupos de WhatsApp tiene restricciones técnicas según la API utilizada:

| API | Grupos Soportados | Limitaciones |
|-----|-------------------|--------------|
| **GoHighLevel** | No directamente | GHL no expone endpoints de grupos WA |
| **WhatsApp Business API (Meta)** | Sí (limitado) | Requiere número de WhatsApp Business verificado |
| **Twilio WhatsApp** | No | Solo mensajes 1:1 |

### Solución Propuesta

Dado que tu sistema usa GHL + Twilio, propongo una **implementación híbrida**:

1. **Listas de difusión internas** (broadcast lists) - Funcionalidad 100% controlable
2. **Integración opcional con WhatsApp Cloud API** - Para grupos reales si tienes acceso

---

## Implementación: Sistema de Listas de Difusión

### Qué es una Lista de Difusión

En lugar de grupos tradicionales (donde todos ven quién está), las listas de difusión envían mensajes 1:1 masivos a una lista de contactos. El destinatario recibe el mensaje como privado.

**Ventajas:**
- No requiere que el contacto te tenga guardado
- Más privacidad (los contactos no se ven entre sí)
- Funciona con cualquier API (GHL, Twilio, etc.)
- Control total sobre quién recibe qué

---

## Cambios en Base de Datos

### Nueva tabla `broadcast_lists`

```sql
CREATE TABLE broadcast_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  member_count INTEGER DEFAULT 0,
  last_broadcast_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Nueva tabla `broadcast_list_members`

```sql
CREATE TABLE broadcast_list_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID REFERENCES broadcast_lists(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(list_id, client_id)
);
```

### Nueva tabla `broadcast_messages`

```sql
CREATE TABLE broadcast_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id UUID REFERENCES broadcast_lists(id) ON DELETE CASCADE,
  message_content TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  status TEXT DEFAULT 'pending', -- pending, sending, completed, failed
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Componentes de UI

### 1. BroadcastListsPage.tsx

Página principal para gestionar listas:
- Crear nueva lista
- Ver todas las listas con conteo de miembros
- Editar/eliminar listas
- Ver historial de envíos

### 2. BroadcastListEditor.tsx

Modal/página para editar una lista:
- Nombre y descripción
- Agregar/quitar miembros (búsqueda de clientes)
- Importar desde segmento existente
- Importar desde tags

### 3. BroadcastComposer.tsx

Interfaz para enviar mensajes:
- Seleccionar lista(s) de destino
- Escribir mensaje con variables dinámicas
- Adjuntar multimedia
- Programar envío (usar lógica existente de scheduled_messages)
- Vista previa del mensaje

### 4. BroadcastHistoryPanel.tsx

Historial de envíos:
- Estado de cada broadcast
- Cuántos enviados/fallidos
- Detalles de errores
- Re-enviar a fallidos

---

## Edge Function: send-broadcast

```typescript
// Entrada: { list_id, message_content, media_url?, scheduled_at? }
// Proceso:
// 1. Obtener todos los miembros de la lista
// 2. Crear registro en broadcast_messages
// 3. Para cada miembro (con rate limiting):
//    - Llamar a send-sms/notify-ghl con el mensaje
//    - Actualizar conteo de enviados/fallidos
// 4. Marcar broadcast como completado
```

---

## Integración con Sidebar

Agregar nuevo item en el menú:
- **Icono:** Users (grupo de personas)
- **Texto:** "Difusión"
- **Posición:** Después de Automatizaciones

---

## Hooks Necesarios

### useBroadcastLists.ts

```typescript
// Queries
useBroadcastLists()           // Lista todas las listas
useBroadcastList(id)          // Detalle de una lista
useBroadcastListMembers(id)   // Miembros de una lista
useBroadcastHistory(listId)   // Historial de envíos

// Mutations
useCreateBroadcastList()      // Crear nueva lista
useUpdateBroadcastList()      // Editar lista
useDeleteBroadcastList()      // Eliminar lista
useAddMembersToList()         // Agregar miembros
useRemoveMemberFromList()     // Quitar miembro
useSendBroadcast()            // Enviar mensaje a lista
```

---

## Flujo de Usuario

```text
1. Usuario va a "Difusión" en sidebar
2. Crea nueva lista "Clientes VIP"
3. Agrega miembros:
   - Buscar por nombre/email/teléfono
   - O importar desde segmento "total_spend > 1000"
   - O importar clientes con tag "vip"
4. Compone mensaje:
   - "Hola {{name}}, como cliente VIP tienes acceso exclusivo..."
5. Elige enviar ahora o programar
6. Sistema envía mensajes 1:1 a cada miembro
7. Ve progreso en tiempo real (15/50 enviados)
8. Revisa historial de envíos con métricas
```

---

## Archivos a Crear

```text
src/
├── components/
│   └── broadcast/
│       ├── BroadcastListsPage.tsx    # Página principal
│       ├── BroadcastListEditor.tsx   # Crear/editar lista
│       ├── BroadcastComposer.tsx     # Componer mensaje
│       ├── BroadcastHistoryPanel.tsx # Historial
│       └── BroadcastMembersPicker.tsx # Selector de miembros
├── hooks/
│   └── useBroadcastLists.ts
└── dashboard/
    └── (integrar en Index.tsx)

supabase/
├── migrations/
│   └── XXXXXX_broadcast_lists.sql
└── functions/
    └── send-broadcast/
        └── index.ts
```

---

## Resumen Técnico

| Aspecto | Implementación |
|---------|----------------|
| Modelo de datos | 3 tablas nuevas |
| UI | 4 componentes + 1 hook |
| Backend | 1 edge function |
| Integración | Reutiliza send-sms/notify-ghl |
| Rate limiting | 1 mensaje/segundo para evitar bloqueos |

---

## Bonus: Grupos Reales de WhatsApp (Opcional Futuro)

Si en el futuro obtienes acceso directo a WhatsApp Cloud API con permisos de grupos, se puede extender:

1. Tabla `whatsapp_groups` (id, name, wa_group_id, members[])
2. Edge function `manage-wa-groups` para crear/administrar
3. Integración con API de Meta directamente

Por ahora, la solución de listas de difusión cubre el 90% del caso de uso de "enviar mensajes a múltiples personas a la vez" sin depender de APIs externas limitadas.

---

## Resultado Esperado

Un sistema completo de listas de difusión donde los usuarios pueden:
- Crear y gestionar listas de contactos
- Enviar mensajes masivos personalizados
- Ver progreso de envío en tiempo real
- Revisar historial y métricas
- Programar envíos futuros

Esto completará la **Fase 5** y llevará la plataforma a **100%+ de paridad** con Funnelchat (ya que incluye funcionalidad adicional de broadcast que Funnelchat maneja de forma similar).
