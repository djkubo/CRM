// Edge Function: process-csv-bulk
// Universal CSV processor for GHL, Stripe Payments, Stripe Customers, PayPal
// Handles 200k+ records server-side without browser timeout limits

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { createLogger, LogLevel } from '../_shared/logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const logger = createLogger('process-csv-bulk', LogLevel.INFO);

type CSVType = 'ghl' | 'stripe_payments' | 'stripe_customers' | 'paypal' | 'subscriptions' | 'auto';

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>;

interface ProcessingResult {
  csvType: string;
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  duration: number;
}

async function verifyAdmin(req: Request): Promise<{ valid: boolean; userId?: string; error?: string }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing Authorization header' };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return { valid: false, error: 'Invalid token' };
  }

  // deno-lint-ignore no-explicit-any
  const { data: isAdmin, error: adminError } = await (supabase as any).rpc('is_admin');
  if (adminError || !isAdmin) {
    return { valid: false, error: 'Not authorized as admin' };
  }

  return { valid: true, userId: user.id };
}

function normalizePhone(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned || cleaned.length < 10) return null;
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

function normalizeAmount(value: string): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num * 100); // Convert to cents
}

function detectCSVType(headers: string[]): CSVType {
  const normalized = headers.map(h => h.toLowerCase().trim());
  
  // GHL: Has "contact id" or specific GHL fields
  if (normalized.some(h => h.includes('contact id') || h === 'ghl_contact_id')) {
    return 'ghl';
  }
  
  // Stripe Payments: Has payment_intent or id with amount
  if (normalized.includes('id') && normalized.includes('amount') && 
      (normalized.includes('payment_intent') || normalized.includes('customer') || normalized.includes('status'))) {
    return 'stripe_payments';
  }
  
  // Stripe Customers: Has customer_id or stripe_customer_id
  if (normalized.some(h => h.includes('customer_id') || h === 'customer') && 
      normalized.includes('email') && !normalized.includes('amount')) {
    return 'stripe_customers';
  }
  
  // PayPal: Has "Nombre" or Spanish PayPal fields, or "Transaction ID"
  if (normalized.some(h => h === 'nombre' || h === 'transaction id' || h.includes('correo electrónico'))) {
    return 'paypal';
  }
  
  // Subscriptions: Has subscription_id and plan
  if (normalized.some(h => h.includes('subscription')) && normalized.some(h => h.includes('plan'))) {
    return 'subscriptions';
  }
  
  return 'auto';
}

async function processGHL(
  lines: string[],
  headers: string[],
  supabase: AnySupabaseClient
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const result: ProcessingResult = {
    csvType: 'ghl',
    totalRows: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    duration: 0
  };

  // Find column indices
  const contactIdIdx = headers.findIndex(h => h.includes('contact id') || h === 'id');
  const emailIdx = headers.findIndex(h => h === 'email');
  const phoneIdx = headers.findIndex(h => h === 'phone');
  const firstNameIdx = headers.findIndex(h => h.includes('first name') || h === 'firstname');
  const lastNameIdx = headers.findIndex(h => h.includes('last name') || h === 'lastname');
  const tagsIdx = headers.findIndex(h => h === 'tags' || h === 'tag');
  const sourceIdx = headers.findIndex(h => h === 'source');
  const createdIdx = headers.findIndex(h => h.includes('created') || h === 'datecreated');

  if (contactIdIdx === -1) {
    result.errors.push('Missing Contact Id column');
    return result;
  }

  interface GHLContact {
    ghlContactId: string;
    email: string | null;
    phone: string | null;
    fullName: string | null;
    tags: string[];
    source: string | null;
    dateCreated: string | null;
  }

  const contacts: GHLContact[] = [];

  // Parse all rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    try {
      const values = parseCSVLine(line);
      const ghlContactId = values[contactIdIdx]?.replace(/"/g, '').trim();
      if (!ghlContactId) continue;

      let email = emailIdx >= 0 ? values[emailIdx]?.replace(/"/g, '').trim().toLowerCase() : '';
      if (email && !email.includes('@')) email = '';

      const rawPhone = phoneIdx >= 0 ? values[phoneIdx]?.replace(/"/g, '').trim() : '';
      const phone = normalizePhone(rawPhone);

      if (!email && !phone) {
        result.skipped++;
        continue;
      }

      const firstName = firstNameIdx >= 0 ? values[firstNameIdx]?.replace(/"/g, '').trim() : '';
      const lastName = lastNameIdx >= 0 ? values[lastNameIdx]?.replace(/"/g, '').trim() : '';
      const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;

      const rawTags = tagsIdx >= 0 ? values[tagsIdx]?.replace(/"/g, '').trim() : '';
      const tags = rawTags ? rawTags.split(',').map(t => t.trim()).filter(Boolean) : [];

      const source = sourceIdx >= 0 ? values[sourceIdx]?.replace(/"/g, '').trim() : null;
      const dateCreated = createdIdx >= 0 ? values[createdIdx]?.replace(/"/g, '').trim() : null;

      contacts.push({ ghlContactId, email: email || null, phone, fullName, tags, source, dateCreated });
      result.totalRows++;
    } catch (err) {
      result.errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'Parse error'}`);
    }
  }

  logger.info('GHL contacts parsed', { total: contacts.length });

  // Load existing clients
  const emailContacts = contacts.filter(c => c.email);
  const uniqueEmails = [...new Set(emailContacts.map(c => c.email!))];
  const existingByEmail = new Map<string, { tags?: string[]; full_name?: string }>();
  const BATCH_SIZE = 1000;

  for (let i = 0; i < uniqueEmails.length; i += BATCH_SIZE) {
    const batch = uniqueEmails.slice(i, i + BATCH_SIZE);
    const { data } = await supabase.from('clients').select('email, tags, full_name').in('email', batch);
    data?.forEach(c => existingByEmail.set(c.email, c));
  }

  // Prepare upserts
  const toUpsert: Record<string, unknown>[] = [];

  for (const contact of contacts) {
    if (!contact.email) continue;

    const existing = existingByEmail.get(contact.email);
    const record: Record<string, unknown> = {
      email: contact.email,
      ghl_contact_id: contact.ghlContactId,
      last_sync: new Date().toISOString()
    };

    if (!existing?.full_name && contact.fullName) record.full_name = contact.fullName;
    if (contact.phone) record.phone = contact.phone;
    if (contact.tags.length > 0) {
      record.tags = [...new Set([...(existing?.tags || []), ...contact.tags])];
    }
    record.acquisition_source = 'ghl';
    record.lifecycle_stage = 'LEAD';

    if (contact.dateCreated) {
      try {
        record.first_seen_at = new Date(contact.dateCreated).toISOString();
      } catch { /* invalid date */ }
    }

    toUpsert.push(record);
    if (existing) result.updated++;
    else result.created++;
  }

  // Execute upserts
  for (let i = 0; i < toUpsert.length; i += BATCH_SIZE) {
    const batch = toUpsert.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('clients').upsert(batch, { onConflict: 'email' });
    if (error) result.errors.push(`Upsert batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
    
    if (i % 10000 === 0 && i > 0) {
      logger.info('GHL upsert progress', { processed: i, total: toUpsert.length });
    }
  }

  result.duration = Date.now() - startTime;
  return result;
}

async function processStripePayments(
  lines: string[],
  headers: string[],
  supabase: AnySupabaseClient
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const result: ProcessingResult = {
    csvType: 'stripe_payments',
    totalRows: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    duration: 0
  };

  // Find column indices - support multiple formats
  const idIdx = headers.findIndex(h => h === 'id');
  const amountIdx = headers.findIndex(h => h === 'amount');
  const currencyIdx = headers.findIndex(h => h === 'currency');
  const statusIdx = headers.findIndex(h => h === 'status');
  const customerIdx = headers.findIndex(h => h === 'customer' || h === 'customer_id');
  const emailIdx = headers.findIndex(h => h === 'customer_email' || h === 'email');
  const createdIdx = headers.findIndex(h => h === 'created' || h === 'created_at');
  const paymentIntentIdx = headers.findIndex(h => h === 'payment_intent');

  if (idIdx === -1 || amountIdx === -1) {
    result.errors.push('Missing required columns: id, amount');
    return result;
  }

  interface Payment {
    id: string;
    amount: number;
    currency: string;
    status: string;
    customerEmail: string | null;
    customerId: string | null;
    created: string | null;
    paymentIntent: string | null;
    rawData: Record<string, string>;
  }

  const payments: Payment[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    try {
      const values = parseCSVLine(line);
      const id = values[idIdx]?.replace(/"/g, '').trim();
      if (!id) continue;

      const rawData: Record<string, string> = {};
      headers.forEach((h, idx) => {
        if (values[idx]) rawData[h] = values[idx].replace(/"/g, '').trim();
      });

      const amount = normalizeAmount(values[amountIdx] || '0');
      const currency = currencyIdx >= 0 ? values[currencyIdx]?.replace(/"/g, '').trim().toLowerCase() || 'usd' : 'usd';
      const status = statusIdx >= 0 ? values[statusIdx]?.replace(/"/g, '').trim() || 'succeeded' : 'succeeded';
      const customerEmail = emailIdx >= 0 ? values[emailIdx]?.replace(/"/g, '').trim().toLowerCase() || null : null;
      const customerId = customerIdx >= 0 ? values[customerIdx]?.replace(/"/g, '').trim() || null : null;
      const created = createdIdx >= 0 ? values[createdIdx]?.replace(/"/g, '').trim() || null : null;
      const paymentIntent = paymentIntentIdx >= 0 ? values[paymentIntentIdx]?.replace(/"/g, '').trim() || null : null;

      payments.push({ id, amount, currency, status, customerEmail, customerId, created, paymentIntent, rawData });
      result.totalRows++;
    } catch (err) {
      result.errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'Parse error'}`);
    }
  }

  logger.info('Stripe payments parsed', { total: payments.length });

  // Prepare transaction inserts
  const BATCH_SIZE = 500;
  const transactions: Record<string, unknown>[] = [];

  for (const payment of payments) {
    const paymentKey = payment.id;
    
    transactions.push({
      stripe_payment_intent_id: payment.paymentIntent || payment.id,
      payment_key: paymentKey,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      customer_email: payment.customerEmail,
      stripe_customer_id: payment.customerId,
      stripe_created_at: payment.created ? new Date(payment.created).toISOString() : null,
      source: 'stripe',
      raw_data: payment.rawData
    });
  }

  // Upsert transactions
  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('transactions')
      .upsert(batch, { onConflict: 'payment_key' });
    
    if (error) {
      result.errors.push(`Transaction batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
    } else {
      result.created += batch.length;
    }

    if (i % 5000 === 0 && i > 0) {
      logger.info('Stripe payments upsert progress', { processed: i, total: transactions.length });
    }
  }

  // Update clients lifecycle_stage to CUSTOMER for those with payments
  const customerEmails = [...new Set(payments.filter(p => p.customerEmail).map(p => p.customerEmail!))];
  
  for (let i = 0; i < customerEmails.length; i += BATCH_SIZE) {
    const batch = customerEmails.slice(i, i + BATCH_SIZE);
    await supabase
      .from('clients')
      .update({ lifecycle_stage: 'CUSTOMER', payment_status: 'active' })
      .in('email', batch);
  }

  result.duration = Date.now() - startTime;
  return result;
}

async function processPayPal(
  lines: string[],
  headers: string[],
  supabase: AnySupabaseClient
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const result: ProcessingResult = {
    csvType: 'paypal',
    totalRows: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    duration: 0
  };

  // PayPal Spanish headers mapping
  const nameIdx = headers.findIndex(h => h === 'nombre' || h === 'name');
  const emailIdx = headers.findIndex(h => h.includes('correo') || h === 'email' || h.includes('from email'));
  const amountIdx = headers.findIndex(h => h === 'bruto' || h === 'gross' || h === 'amount');
  const currencyIdx = headers.findIndex(h => h === 'divisa' || h === 'currency');
  const statusIdx = headers.findIndex(h => h === 'estado' || h === 'status');
  const transactionIdx = headers.findIndex(h => h.includes('transaction id') || h === 'id de transacción');
  const dateIdx = headers.findIndex(h => h === 'fecha' || h === 'date');
  const typeIdx = headers.findIndex(h => h === 'tipo' || h === 'type');

  interface PayPalTx {
    transactionId: string;
    name: string | null;
    email: string | null;
    amount: number;
    currency: string;
    status: string;
    date: string | null;
    type: string | null;
    rawData: Record<string, string>;
  }

  const transactions: PayPalTx[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    try {
      const values = parseCSVLine(line);
      
      const rawData: Record<string, string> = {};
      headers.forEach((h, idx) => {
        if (values[idx]) rawData[h] = values[idx].replace(/"/g, '').trim();
      });

      const transactionId = transactionIdx >= 0 ? values[transactionIdx]?.replace(/"/g, '').trim() : null;
      if (!transactionId) {
        result.skipped++;
        continue;
      }

      const name = nameIdx >= 0 ? values[nameIdx]?.replace(/"/g, '').trim() || null : null;
      const email = emailIdx >= 0 ? values[emailIdx]?.replace(/"/g, '').trim().toLowerCase() || null : null;
      const amount = normalizeAmount(values[amountIdx] || '0');
      const currency = currencyIdx >= 0 ? values[currencyIdx]?.replace(/"/g, '').trim().toLowerCase() || 'usd' : 'usd';
      const status = statusIdx >= 0 ? values[statusIdx]?.replace(/"/g, '').trim() || 'completed' : 'completed';
      const date = dateIdx >= 0 ? values[dateIdx]?.replace(/"/g, '').trim() || null : null;
      const type = typeIdx >= 0 ? values[typeIdx]?.replace(/"/g, '').trim() || null : null;

      // Skip non-payment types
      if (type && (type.toLowerCase().includes('retiro') || type.toLowerCase().includes('withdrawal'))) {
        result.skipped++;
        continue;
      }

      transactions.push({ transactionId, name, email, amount, currency, status, date, type, rawData });
      result.totalRows++;
    } catch (err) {
      result.errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'Parse error'}`);
    }
  }

  logger.info('PayPal transactions parsed', { total: transactions.length });

  const BATCH_SIZE = 500;
  const txRecords: Record<string, unknown>[] = [];

  for (const tx of transactions) {
    txRecords.push({
      stripe_payment_intent_id: `paypal_${tx.transactionId}`,
      payment_key: tx.transactionId,
      external_transaction_id: tx.transactionId,
      amount: tx.amount,
      currency: tx.currency,
      status: tx.status === 'Completado' || tx.status === 'completed' ? 'succeeded' : tx.status.toLowerCase(),
      customer_email: tx.email,
      stripe_created_at: tx.date ? new Date(tx.date).toISOString() : null,
      source: 'paypal',
      payment_type: tx.type,
      raw_data: tx.rawData
    });
  }

  for (let i = 0; i < txRecords.length; i += BATCH_SIZE) {
    const batch = txRecords.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('transactions')
      .upsert(batch, { onConflict: 'payment_key' });
    
    if (error) {
      result.errors.push(`PayPal batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
    } else {
      result.created += batch.length;
    }
  }

  // Create/update clients for PayPal customers
  const customerEmails = [...new Set(transactions.filter(t => t.email).map(t => t.email!))];
  const existingEmails = new Set<string>();

  for (let i = 0; i < customerEmails.length; i += BATCH_SIZE) {
    const batch = customerEmails.slice(i, i + BATCH_SIZE);
    const { data } = await supabase.from('clients').select('email').in('email', batch);
    data?.forEach(c => existingEmails.add(c.email));
  }

  const newClients: Record<string, unknown>[] = [];
  for (const tx of transactions) {
    if (tx.email && !existingEmails.has(tx.email)) {
      newClients.push({
        email: tx.email,
        full_name: tx.name,
        lifecycle_stage: 'CUSTOMER',
        acquisition_source: 'paypal',
        payment_status: 'active'
      });
      existingEmails.add(tx.email);
    }
  }

  for (let i = 0; i < newClients.length; i += BATCH_SIZE) {
    const batch = newClients.slice(i, i + BATCH_SIZE);
    await supabase.from('clients').upsert(batch, { onConflict: 'email' });
  }

  result.duration = Date.now() - startTime;
  return result;
}

async function processStripeCustomers(
  lines: string[],
  headers: string[],
  supabase: AnySupabaseClient
): Promise<ProcessingResult> {
  const startTime = Date.now();
  const result: ProcessingResult = {
    csvType: 'stripe_customers',
    totalRows: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    duration: 0
  };

  const emailIdx = headers.findIndex(h => h === 'email');
  const customerIdIdx = headers.findIndex(h => h === 'customer' || h === 'customer_id' || h === 'id');
  const nameIdx = headers.findIndex(h => h === 'name' || h === 'customer_name');
  const ltvIdx = headers.findIndex(h => h === 'ltv' || h === 'lifetime_value' || h === 'total_spend');

  if (emailIdx === -1) {
    result.errors.push('Missing email column');
    return result;
  }

  interface Customer {
    email: string;
    customerId: string | null;
    name: string | null;
    ltv: number;
  }

  const customers: Customer[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    try {
      const values = parseCSVLine(line);
      const email = values[emailIdx]?.replace(/"/g, '').trim().toLowerCase();
      if (!email || !email.includes('@')) {
        result.skipped++;
        continue;
      }

      const customerId = customerIdIdx >= 0 ? values[customerIdIdx]?.replace(/"/g, '').trim() || null : null;
      const name = nameIdx >= 0 ? values[nameIdx]?.replace(/"/g, '').trim() || null : null;
      const ltv = ltvIdx >= 0 ? normalizeAmount(values[ltvIdx] || '0') : 0;

      customers.push({ email, customerId, name, ltv });
      result.totalRows++;
    } catch (err) {
      result.errors.push(`Row ${i + 1}: ${err instanceof Error ? err.message : 'Parse error'}`);
    }
  }

  logger.info('Stripe customers parsed', { total: customers.length });

  const BATCH_SIZE = 500;
  const clientRecords: Record<string, unknown>[] = [];

  for (const customer of customers) {
    clientRecords.push({
      email: customer.email,
      stripe_customer_id: customer.customerId,
      full_name: customer.name,
      total_spend: customer.ltv,
      lifecycle_stage: customer.ltv > 0 ? 'CUSTOMER' : 'LEAD',
      payment_status: customer.ltv > 0 ? 'active' : null
    });
  }

  for (let i = 0; i < clientRecords.length; i += BATCH_SIZE) {
    const batch = clientRecords.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('clients').upsert(batch, { onConflict: 'email' });
    
    if (error) {
      result.errors.push(`Customer batch ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`);
    } else {
      result.created += batch.length;
    }
  }

  result.duration = Date.now() - startTime;
  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authCheck = await verifyAdmin(req);
    if (!authCheck.valid) {
      return new Response(
        JSON.stringify({ ok: false, error: authCheck.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { csvText, csvType: requestedType } = await req.json() as { csvText: string; csvType?: CSVType };

    if (!csvText || typeof csvText !== 'string') {
      return new Response(
        JSON.stringify({ ok: false, error: 'csvText is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info('Starting CSV bulk processing', { csvLength: csvText.length, requestedType });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Remove BOM and normalize line endings
    const cleanCsv = csvText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = cleanCsv.split('\n').filter(line => line.trim());

    if (lines.length < 2) {
      return new Response(
        JSON.stringify({ ok: false, error: 'CSV must have at least a header and one data row' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse headers
    const headerLine = lines[0];
    const headers = parseCSVLine(headerLine).map(h => h.toLowerCase().replace(/"/g, '').trim());

    logger.info('CSV headers parsed', { headerCount: headers.length, sampleHeaders: headers.slice(0, 5) });

    // Detect or use requested type
    const csvType = requestedType && requestedType !== 'auto' ? requestedType : detectCSVType(headers);

    logger.info('Processing as type', { csvType });

    let result: ProcessingResult;

    switch (csvType) {
      case 'ghl':
        result = await processGHL(lines, headers, supabase);
        break;
      case 'stripe_payments':
        result = await processStripePayments(lines, headers, supabase);
        break;
      case 'stripe_customers':
        result = await processStripeCustomers(lines, headers, supabase);
        break;
      case 'paypal':
        result = await processPayPal(lines, headers, supabase);
        break;
      default:
        return new Response(
          JSON.stringify({ ok: false, error: `Unknown CSV type. Detected headers: ${headers.slice(0, 10).join(', ')}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    logger.info('Processing complete', result);

    return new Response(
      JSON.stringify({ ok: true, result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error('Fatal error', error instanceof Error ? error : new Error(String(error)));
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
