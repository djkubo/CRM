
# Plan: Reparación del Módulo Diagnostics

## Resumen
La sección Diagnostics está 90% funcional. Los problemas principales son:
1. La reconciliación con Stripe falló porque las transacciones no están sincronizadas
2. PayPal reconciliation no está implementada
3. Los datos de calidad muestran warnings legítimos que requieren atención

## Cambios Propuestos

### 1. Corregir Reconciliación Stripe (Prioridad Alta)

El problema no es del módulo Diagnostics, sino que las transacciones de Stripe no están en la tabla `transactions`. La reconciliación está funcionando correctamente - está detectando el problema real.

**Acción:** El usuario necesita ejecutar una sincronización completa de Stripe desde el Sync Center antes de poder reconciliar.

### 2. Implementar Reconciliación PayPal (Prioridad Media)

El Edge Function `reconcile-metrics` tiene un placeholder para PayPal que nunca se completó:

```typescript
// Línea 124-128 de reconcile-metrics/index.ts
} else if (source === 'paypal') {
  // PayPal reconciliation would go here
  console.log('[reconcile] PayPal reconciliation not yet implemented');
}
```

**Cambios en:** `supabase/functions/reconcile-metrics/index.ts`
- Agregar llamada a PayPal API para obtener transacciones del período
- Comparar con `transactions` table donde `source = 'paypal'`
- Guardar diferencias en `reconciliation_runs`

### 3. Agregar Alerta Visual para Sync Requerido (Prioridad Media)

En `DiagnosticsPanel.tsx`, agregar un banner que detecte si la última reconciliación falló con 100% diferencia:

```typescript
// Nuevo componente de alerta
{reconciliationRuns[0]?.difference_pct === 100 && (
  <Alert variant="destructive">
    <AlertTitle>Sincronización Requerida</AlertTitle>
    <AlertDescription>
      La reconciliación falló. Ejecuta "Sync Stripe" primero.
    </AlertDescription>
  </Alert>
)}
```

**Cambios en:** `src/components/dashboard/DiagnosticsPanel.tsx`

### 4. Agregar Timestamp de Última Actualización (Prioridad Baja)

Mostrar cuándo fue el último check de calidad para que el usuario sepa si los datos están frescos.

**Cambios en:** `src/components/dashboard/DiagnosticsPanel.tsx`

## Resumen de Archivos a Modificar

| Archivo | Cambio |
|---------|--------|
| `supabase/functions/reconcile-metrics/index.ts` | Implementar PayPal reconciliation |
| `src/components/dashboard/DiagnosticsPanel.tsx` | Agregar alertas de sync requerido y timestamps |

## Detalles Técnicos

### Implementación PayPal Reconciliation

```typescript
// En reconcile-metrics/index.ts
} else if (source === 'paypal') {
  const paypalClientId = Deno.env.get('PAYPAL_CLIENT_ID');
  const paypalSecret = Deno.env.get('PAYPAL_SECRET');
  
  if (!paypalClientId || !paypalSecret) {
    throw new Error('PayPal credentials not configured');
  }
  
  // Get OAuth token
  const tokenRes = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${paypalClientId}:${paypalSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  
  const { access_token } = await tokenRes.json();
  
  // Fetch transactions
  const txRes = await fetch(
    `https://api-m.paypal.com/v1/reporting/transactions?` +
    `start_date=${start_date}T00:00:00-0700&end_date=${end_date}T23:59:59-0700`,
    { headers: { 'Authorization': `Bearer ${access_token}` } }
  );
  
  const txData = await txRes.json();
  
  for (const tx of txData.transaction_details || []) {
    if (tx.transaction_info?.transaction_status === 'S') { // Succeeded
      const amount = parseFloat(tx.transaction_info.transaction_amount?.value || '0');
      externalTotal += Math.round(amount * 100);
      externalTransactions.push(tx.transaction_info.transaction_id);
    }
  }
}
```

### Alerta de Sync Requerido

```typescript
// En DiagnosticsPanel.tsx, después del Alert de Critical Issues
{reconciliationRuns[0]?.status === 'fail' && reconciliationRuns[0]?.difference_pct >= 50 && (
  <Alert className="border-orange-500/50 bg-orange-500/10">
    <RefreshCw className="h-4 w-4 text-orange-400" />
    <AlertTitle className="text-sm text-orange-400">Sincronización Requerida</AlertTitle>
    <AlertDescription className="text-xs text-orange-300">
      La última reconciliación detectó {reconciliationRuns[0].missing_internal?.length || 0} transacciones 
      faltantes. Ejecuta una sincronización de {reconciliationRuns[0].source} antes de reconciliar.
    </AlertDescription>
  </Alert>
)}
```

## Resultado Esperado

Después de estos cambios:
1. El usuario verá un mensaje claro cuando necesite sincronizar antes de reconciliar
2. PayPal podrá ser reconciliado igual que Stripe
3. Los timestamps mostrarán la frescura de los datos
4. Las alertas se dispararán correctamente según la lógica establecida

## Notas

- Los 6 Data Quality Checks están funcionando perfectamente
- El AI Audit con OpenAI está operativo
- Los rebuilds funcionan pero ninguno ha sido promovido
- El problema de 65% clientes sin source es dato real que requiere limpieza manual
