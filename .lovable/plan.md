# VRP Admin - Plan de Desarrollo

## Estado: 100% Paridad con Funnelchat ✅

---

## Fases Completadas

### Fase 1: Chat en Tiempo Real ✅
- Inbox unificado con WhatsApp/SMS
- Historial de conversaciones por cliente
- Indicadores de lectura
- Componente BotChatPage implementado

### Fase 2: Mensajes Multimedia ✅
- Bucket de storage `chat-media` creado
- Campos media_url, media_type, media_filename en chat_events
- MediaAttachmentButton para subir archivos
- ChatMediaBubble para renderizar imágenes, audio, video, PDF

### Fase 3: Mensajes Programados ✅
- Tabla `scheduled_messages` creada
- Hook useScheduledMessages implementado
- ScheduleMessageDialog con calendario y opciones rápidas
- ScheduledMessagesPanel para gestión
- Integración con composer de chat

### Fase 4: Constructor de Flujos Visual ✅
- Tablas `automation_flows` y `flow_executions` creadas
- React Flow (@xyflow/react) instalado
- 7 nodos personalizados:
  - TriggerNode (inicio del flujo)
  - MessageNode (envío WA/SMS/Email)
  - DelayNode (esperar X tiempo)
  - ConditionNode (if/else con 2 salidas)
  - TagNode (agregar/quitar tags)
  - WebhookNode (llamadas HTTP)
  - EndNode (fin del flujo)
- FlowBuilder con canvas drag-and-drop
- NodesSidebar para arrastrar nodos
- NodeEditor para configurar propiedades
- FlowsList para gestión de flujos
- FlowsPage integrada en Sidebar
- Edge function execute-flow para motor de ejecución
- Auto-guardado y estadísticas de ejecución

---

## Funcionalidades Core del Sistema

### Dashboard
- Command Center con KPIs en tiempo real
- MRR, Churn, LTV, Balance
- Gráficos de revenue por producto

### Gestión de Clientes
- CRUD completo de clientes
- Lifecycle stages (Lead → Trial → Customer → Churned)
- Tags y segmentación
- Timeline de eventos

### Facturación y Pagos
- Integración Stripe + PayPal
- Facturas con estado (paid, open, past_due)
- Recovery automático de pagos fallidos
- Portal de actualización de tarjeta

### Comunicación
- Chat en tiempo real (WhatsApp vía GHL)
- Mensajes multimedia
- Mensajes programados
- Templates de mensajes

### Automatizaciones
- Constructor visual de flujos (estilo Funnelchat)
- Triggers: nuevo lead, pago fallido, trial expirando, tag agregado
- Acciones: mensajes, delays, condiciones, tags, webhooks
- Historial de ejecuciones con logs

### Analytics
- LTV por cliente
- MRR movements (new, expansion, contraction, churn)
- Cohort retention
- Revenue por plan/producto

### Integraciones
- Stripe webhooks
- PayPal webhooks
- GoHighLevel (GHL) sync
- ManyChat sync
- Import CSV bulk

---

## Arquitectura Técnica

```
Frontend (React + TypeScript + Tailwind)
├── Components/
│   ├── dashboard/     # Páginas principales
│   ├── flows/         # Constructor de flujos
│   ├── ui/            # Componentes shadcn
│   └── analytics/     # Métricas y gráficos
├── Hooks/             # React Query + lógica
└── Integrations/      # Supabase client + types

Backend (Supabase)
├── Database (PostgreSQL)
│   ├── clients, invoices, subscriptions
│   ├── chat_events, messages
│   ├── automation_flows, flow_executions
│   └── scheduled_messages
├── Edge Functions (Deno)
│   ├── Webhooks (stripe, paypal, ghl, twilio)
│   ├── Sync (ghl, manychat, csv)
│   ├── Messaging (send-sms, notify-ghl)
│   └── Automation (execute-flow)
└── Storage (chat-media bucket)
```

---

## Próximos Pasos (Opcionales)

1. **A/B Testing de mensajes** - Comparar efectividad de templates
2. **Analytics de flujos** - Métricas por nodo, conversion rates
3. **Scheduler de flujos** - Ejecutar flujos diferidos con cron
4. **Import/Export de flujos** - Compartir templates entre cuentas
5. **Notificaciones push** - Alertas en tiempo real

---

## Notas Técnicas

- React Flow v12+ para canvas de flujos
- Auto-save con debounce de 2 segundos
- Delays en flujos marcan ejecución como "paused"
- Variables soportadas: {{name}}, {{email}}, {{phone}}, {{amount}}
- RLS policies protegen todas las tablas
