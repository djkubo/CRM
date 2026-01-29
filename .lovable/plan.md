

# Plan: Campañas Reales - Email Funcional y Variables Dinámicas

## Resumen Ejecutivo
La función `send-campaign` tiene dos problemas críticos que la hacen "de mentira":
1. **Email no implementado**: El canal `email` está en el UI pero la Edge Function no tiene lógica para enviarlo
2. **Variables hardcodeadas**: `{{amount}}` siempre muestra `$0.00` y `{{days_left}}` siempre muestra `3`

Implementaremos envío real de emails via Resend y cálculo dinámico de variables basado en datos reales de deuda del cliente.

---

## Análisis del Problema

### Estado Actual de la Función
```text
Línea 168: message = message.replace(/\{\{amount\}\}/g, '$0.00');  // ← HARDCODED
Línea 169: message = message.replace(/\{\{days_left\}\}/g, '3');    // ← HARDCODED

Canales implementados:
  ✅ WhatsApp (Twilio) - Líneas 176-201
  ✅ SMS (Twilio) - Líneas 202-227
  ✅ Messenger (ManyChat) - Líneas 228-259
  ❌ Email - NO EXISTE
```

### Secretos Disponibles
- ✅ TWILIO_* (3 secretos) - Configurados
- ✅ MANYCHAT_API_KEY - Configurado
- ❌ RESEND_API_KEY - **NO EXISTE** (necesario para email)

---

## Cambios a Implementar

### 1. Agregar Secret: RESEND_API_KEY

Antes de implementar el código, necesitaremos que configures el API key de Resend:
- Crear cuenta en https://resend.com (gratis hasta 100 emails/día)
- Crear API key en https://resend.com/api-keys
- Verificar dominio en https://resend.com/domains (o usar dominio de pruebas)

### 2. Implementar Cálculo de Variables Dinámicas

**Archivo**: `supabase/functions/send-campaign/index.ts`

**Nueva función helper** para calcular deuda real del cliente:

```typescript
async function getClientDebtInfo(
  supabase: SupabaseClient, 
  clientEmail: string
): Promise<{ totalDebt: number; daysUntilDue: number | null }> {
  // 1. Buscar facturas abiertas del cliente
  const { data: openInvoices } = await supabase
    .from('invoices')
    .select('amount_due, due_date')
    .eq('customer_email', clientEmail)
    .in('status', ['open', 'past_due', 'draft'])
    .order('due_date', { ascending: true });

  // 2. Calcular monto total de deuda
  const totalDebt = (openInvoices || []).reduce(
    (sum, inv) => sum + (inv.amount_due || 0), 
    0
  );

  // 3. Calcular días hasta vencimiento (de la factura más próxima)
  let daysUntilDue: number | null = null;
  if (openInvoices?.length && openInvoices[0].due_date) {
    const dueDate = new Date(openInvoices[0].due_date);
    const today = new Date();
    daysUntilDue = Math.ceil(
      (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  return { totalDebt, daysUntilDue };
}
```

**Modificar reemplazo de variables** (líneas 165-169):

```typescript
// Antes (hardcoded):
message = message.replace(/\{\{amount\}\}/g, '$0.00');
message = message.replace(/\{\{days_left\}\}/g, '3');

// Después (dinámico):
const debtInfo = await getClientDebtInfo(supabase, client.email);
const formattedAmount = `$${(debtInfo.totalDebt / 100).toFixed(2)}`;
const daysLeft = debtInfo.daysUntilDue !== null 
  ? Math.max(0, debtInfo.daysUntilDue).toString() 
  : 'N/A';

message = message.replace(/\{\{amount\}\}/g, formattedAmount);
message = message.replace(/\{\{days_left\}\}/g, daysLeft);
```

---

### 3. Implementar Canal de Email (Resend)

**Archivo**: `supabase/functions/send-campaign/index.ts`

**Agregar Resend API key** (después de línea 68):

```typescript
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
```

**Agregar validación de email** (junto a la validación de teléfono, línea 92):

```typescript
// No email check for email channel
if (!exclusionReason && campaign.channel === 'email' && !client.email) {
  exclusionReason = 'no_email';
}
```

**Agregar bloque de envío de Email** (después de línea 259, antes del else final):

```typescript
} else if (campaign.channel === 'email') {
  // Check for email provider configuration
  if (!RESEND_API_KEY) {
    console.error('Email provider not configured: RESEND_API_KEY missing');
    await supabase.from('campaign_recipients').update({
      status: 'failed',
      exclusion_reason: 'email_provider_not_configured',
    }).eq('id', recipient.id);
    failedCount++;
    results.push({ 
      client_id: client.id, 
      status: 'failed', 
      reason: 'Email provider not configured' 
    });
    continue;
  }

  if (!client.email) {
    exclusionReason = 'no_email';
  } else {
    // Build email subject from template or campaign name
    const emailSubject = campaign.template?.subject || campaign.name || 'Mensaje importante';
    
    // Send via Resend API
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Cobranza <noreply@tudominio.com>', // TODO: Make configurable
        to: [client.email],
        subject: emailSubject,
        html: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <p>${message.replace(/\n/g, '<br>')}</p>
        </div>`,
        text: message,
      }),
    });

    const resendResult = await resendResponse.json();
    
    if (resendResponse.ok && resendResult.id) {
      sendSuccess = true;
      externalMessageId = resendResult.id;
    } else {
      console.error('Resend error:', resendResult);
    }
  }
}
```

---

## Flujo de Datos Post-Implementación

```text
┌─────────────────────────────────────────────────────────────────────┐
│              FLUJO DE CAMPAÑA CON VARIABLES REALES                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  1. Usuario crea campaña con template:                              │
│     "Hola {{name}}, debes {{amount}}. Tienes {{days_left}} días."   │
│                                                                     │
│  2. send-campaign procesa cada destinatario:                        │
│                                                                     │
│     ┌─────────────────────────────────────────────────────┐         │
│     │  getClientDebtInfo(supabase, 'juan@email.com')      │         │
│     │    ↓                                                │         │
│     │  SELECT amount_due, due_date FROM invoices          │         │
│     │  WHERE customer_email = 'juan@email.com'            │         │
│     │  AND status IN ('open', 'past_due')                 │         │
│     │    ↓                                                │         │
│     │  return { totalDebt: 15000, daysUntilDue: 5 }       │         │
│     └─────────────────────────────────────────────────────┘         │
│                                                                     │
│  3. Variables reemplazadas:                                         │
│     {{name}} → "Juan Pérez"                                         │
│     {{amount}} → "$150.00"  (15000 cents / 100)                     │
│     {{days_left}} → "5"                                             │
│                                                                     │
│  4. Mensaje final enviado:                                          │
│     "Hola Juan Pérez, debes $150.00. Tienes 5 días."                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Archivo a Modificar

| Archivo | Cambios |
|---------|---------|
| `supabase/functions/send-campaign/index.ts` | + helper getClientDebtInfo(), + canal email con Resend, + variables dinámicas |

---

## Variables Soportadas Post-Implementación

| Variable | Fuente | Ejemplo |
|----------|--------|---------|
| `{{name}}` | `client.full_name` | "María López" |
| `{{amount}}` | Suma de `invoices.amount_due` donde status = open/past_due | "$247.50" |
| `{{days_left}}` | Días hasta `invoices.due_date` más próximo | "3" o "N/A" |

---

## Manejo de Errores

1. **Sin RESEND_API_KEY**: Retorna error claro `"Email provider not configured"` y marca como `failed`
2. **Cliente sin email**: Marca como `excluded` con razón `no_email`
3. **Cliente sin deuda**: Muestra `$0.00` (comportamiento correcto)
4. **Sin fecha de vencimiento**: Muestra `N/A` en lugar de número

---

## Requisito Previo

Para que el canal de email funcione, necesitarás configurar:

1. **RESEND_API_KEY**: API key de Resend para envío de emails
2. **Dominio verificado** (opcional pero recomendado): Para que los emails no lleguen a spam

---

## Testing Post-Implementación

1. **Test de Variables**: Crear campaña de prueba para cliente con deuda conocida, verificar que muestre monto real
2. **Test Email (Dry Run)**: Ejecutar campaña con `dry_run: true` para ver que el canal email está disponible
3. **Test Email Real**: Una vez configurado RESEND_API_KEY, enviar campaña de prueba a email propio
4. **Test Sin Deuda**: Verificar que clientes sin facturas abiertas muestren `$0.00`

