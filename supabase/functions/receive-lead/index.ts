import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Declare EdgeRuntime for Deno
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key, x-source',
};

interface LeadPayload {
  event_id?: string;
  source?: string;
  email?: string;
  phone?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  campaign?: string;
  external_manychat_id?: string;
  external_ghl_id?: string;
  manychat_subscriber_id?: string;
  subscriber_id?: string;
  ghl_contact_id?: string;
  timestamp?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

interface ClientRecord {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  manychat_subscriber_id: string | null;
  ghl_contact_id: string | null;
  acquisition_source: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  tags: string[] | null;
  [key: string]: unknown;
}

// ============ PHONE NORMALIZATION ============
function normalizePhone(phone?: string): string | null {
  if (!phone) return null;
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  cleaned = cleaned.replace(/^0+/, '');
  if (cleaned.length === 10) return '+52' + cleaned;
  if (cleaned.length === 11 && cleaned.startsWith('1')) return '+' + cleaned;
  if (cleaned.length >= 11) return '+' + cleaned;
  if (cleaned.length >= 10) return '+' + cleaned;
  return null;
}

// ============ SANITIZE STRING ============
function sanitizeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return String(value).trim() || null;
  const trimmed = value.trim();
  // Handle ManyChat template placeholders like {{email}} that weren't replaced
  if (trimmed === '' || trimmed.startsWith('{{') || trimmed === 'null' || trimmed === 'undefined') {
    return null;
  }
  return trimmed;
}

// ============ VALIDATE EMAIL ============
function isValidEmail(email: string | null): boolean {
  if (!email) return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

// ============ SANITIZE TAGS ============
function sanitizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return tags
    .map(t => sanitizeString(t))
    .filter((t): t is string => t !== null && t.length > 0);
}

// ============ PROCESS SINGLE LEAD ============
async function processLead(
  supabase: SupabaseClient,
  body: LeadPayload,
  sourceHeader: string,
  requestId: string
): Promise<{ success: boolean; action: string; client_id?: string; error?: string; event_id?: string }> {
  
  try {
    const source = sanitizeString(body.source) || sourceHeader;
    
    // Sanitize all inputs
    const rawEmail = sanitizeString(body.email);
    const rawPhone = sanitizeString(body.phone);
    const rawName = sanitizeString(body.full_name);
    const firstName = sanitizeString(body.first_name);
    const lastName = sanitizeString(body.last_name);
    
    // Normalize and validate
    const emailNormalized = rawEmail && isValidEmail(rawEmail) ? rawEmail.toLowerCase() : null;
    const phoneNormalized = normalizePhone(rawPhone || undefined);
    
    // Must have at least one valid contact method
    if (!emailNormalized && !phoneNormalized) {
      return { 
        success: false, 
        action: 'skipped', 
        error: 'No valid email or phone',
        event_id: `invalid_${Date.now()}`
      };
    }

    // Build full name
    const fullName = rawName || 
      (firstName && lastName ? `${firstName} ${lastName}` : 
       firstName || lastName || null);

    // Sanitize external IDs
    const manychatId = sanitizeString(body.external_manychat_id) || 
                       sanitizeString(body.manychat_subscriber_id) || 
                       sanitizeString(body.subscriber_id) || null;
    const ghlId = sanitizeString(body.external_ghl_id) || 
                  sanitizeString(body.ghl_contact_id) || null;

    // Generate event_id for idempotency
    const eventId = sanitizeString(body.event_id) || 
      manychatId ||
      ghlId ||
      `${source}_${emailNormalized || phoneNormalized}_${Date.now()}`;

    // Sanitize UTM fields
    const utmSource = sanitizeString(body.utm_source);
    const utmMedium = sanitizeString(body.utm_medium);
    const utmCampaign = sanitizeString(body.utm_campaign) || sanitizeString(body.campaign);
    const utmContent = sanitizeString(body.utm_content);
    const utmTerm = sanitizeString(body.utm_term);
    
    // Sanitize tags
    const tags = sanitizeTags(body.tags);

    // Idempotency check
    const { data: existingEvent } = await supabase
      .from('lead_events')
      .select('id')
      .eq('source', source)
      .eq('event_id', eventId)
      .maybeSingle();

    if (existingEvent) {
      return { success: true, action: 'skipped', event_id: eventId };
    }

    // Find existing client
    let existingClient: ClientRecord | null = null;
    
    if (emailNormalized) {
      const { data } = await supabase
        .from('clients')
        .select('*')
        .ilike('email', emailNormalized)
        .maybeSingle();
      existingClient = data as ClientRecord | null;
    }
    
    if (!existingClient && phoneNormalized) {
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('phone', phoneNormalized)
        .maybeSingle();
      existingClient = data as ClientRecord | null;
    }

    if (!existingClient && manychatId) {
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('manychat_subscriber_id', manychatId)
        .maybeSingle();
      existingClient = data as ClientRecord | null;
    }
    
    if (!existingClient && ghlId) {
      const { data } = await supabase
        .from('clients')
        .select('*')
        .eq('ghl_contact_id', ghlId)
        .maybeSingle();
      existingClient = data as ClientRecord | null;
    }

    let clientId: string;
    let action: 'created' | 'updated';

    if (existingClient) {
      const updates: Record<string, unknown> = {};
      
      if (!existingClient.email && emailNormalized) updates.email = emailNormalized;
      if (!existingClient.phone && phoneNormalized) updates.phone = phoneNormalized;
      if (!existingClient.full_name && fullName) updates.full_name = fullName;
      if (!existingClient.manychat_subscriber_id && manychatId) updates.manychat_subscriber_id = manychatId;
      if (!existingClient.ghl_contact_id && ghlId) updates.ghl_contact_id = ghlId;
      if (!existingClient.acquisition_source && source) updates.acquisition_source = source;
      if (!existingClient.utm_source && utmSource) updates.utm_source = utmSource;
      if (!existingClient.utm_medium && utmMedium) updates.utm_medium = utmMedium;
      if (!existingClient.utm_campaign && utmCampaign) updates.utm_campaign = utmCampaign;
      if (!existingClient.utm_content && utmContent) updates.utm_content = utmContent;
      if (!existingClient.utm_term && utmTerm) updates.utm_term = utmTerm;
      
      if (tags.length > 0) {
        const existingTags = existingClient.tags || [];
        updates.tags = [...new Set([...existingTags, ...tags])];
      }

      updates.last_lead_at = new Date().toISOString();
      updates.last_sync = new Date().toISOString();

      if (Object.keys(updates).length > 0) {
        await supabase.from('clients').update(updates).eq('id', existingClient.id);
      }

      clientId = existingClient.id;
      action = 'updated';
      
    } else {
      const { data: created, error } = await supabase
        .from('clients')
        .insert({
          email: emailNormalized,
          phone: phoneNormalized,
          full_name: fullName,
          lifecycle_stage: 'LEAD',
          lead_status: 'lead',
          status: 'active',
          acquisition_source: source,
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
          utm_content: utmContent,
          utm_term: utmTerm,
          first_seen_at: new Date().toISOString(),
          last_lead_at: new Date().toISOString(),
          manychat_subscriber_id: manychatId,
          ghl_contact_id: ghlId,
          tags: tags,
          customer_metadata: body.metadata || {},
        })
        .select('id')
        .single();

      if (error) throw error;
      clientId = (created as { id: string }).id;
      action = 'created';
    }

    // Record lead event
    await supabase.from('lead_events').insert({
      source,
      event_id: eventId,
      event_type: action === 'created' ? 'lead_created' : 'lead_updated',
      client_id: clientId,
      email: emailNormalized,
      phone: phoneNormalized,
      full_name: fullName,
      payload: body,
    });

    return { success: true, action, client_id: clientId, event_id: eventId };
    
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${requestId}] Lead processing error:`, msg);
    return { success: false, action: 'error', error: msg };
  }
}

// ============ BATCH PROCESSOR ============
async function processBatch(
  supabase: SupabaseClient,
  leads: LeadPayload[],
  sourceHeader: string,
  requestId: string
): Promise<{ processed: number; created: number; updated: number; skipped: number; errors: number; errorDetails: string[] }> {
  let processed = 0;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails: string[] = [];

  // Process in parallel batches of 10
  const BATCH_SIZE = 10;
  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    const batch = leads.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(lead => processLead(supabase, lead, sourceHeader, requestId))
    );
    
    for (const result of results) {
      processed++;
      if (!result.success && result.action === 'error') {
        errors++;
        if (errorDetails.length < 10) {
          errorDetails.push(result.error || 'Unknown error');
        }
      } else if (result.action === 'created') created++;
      else if (result.action === 'updated') updated++;
      else if (result.action === 'skipped') skipped++;
    }
    
    if (processed % 100 === 0) {
      console.log(`[${requestId}] Progress: ${processed}/${leads.length} (${created} created, ${updated} updated, ${skipped} skipped, ${errors} errors)`);
    }
  }

  console.log(`[${requestId}] BATCH COMPLETE: ${processed} processed, ${created} created, ${updated} updated, ${skipped} skipped, ${errors} errors`);
  return { processed, created, updated, skipped, errors, errorDetails };
}

// ============ MAIN HANDLER ============
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const requestId = crypto.randomUUID().slice(0, 8);
  
  console.log(`[${requestId}] receive-lead: Start`);

  try {
    // Security check
    const adminKey = Deno.env.get('ADMIN_API_KEY');
    const providedKey = req.headers.get('x-admin-key');
    
    if (!adminKey) {
      return new Response(
        JSON.stringify({ error: 'Service not configured', code: 'MISSING_SECRET' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!providedKey || providedKey !== adminKey) {
      console.warn(`[${requestId}] Invalid/missing X-ADMIN-KEY`);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const sourceHeader = req.headers.get('x-source') || 'api';
    
    let body: LeadPayload | { leads: LeadPayload[] };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // ============ BATCH MODE ============
    if ('leads' in body && Array.isArray(body.leads)) {
      const leads: LeadPayload[] = body.leads;
      const totalLeads = leads.length;
      
      if (totalLeads === 0) {
        return new Response(
          JSON.stringify({ success: true, message: 'No leads to process' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log(`[${requestId}] BATCH MODE: Processing ${totalLeads} leads`);

      // For batches > 50, use background processing
      if (totalLeads > 50) {
        const backgroundTask = processBatch(supabase, leads, sourceHeader, requestId);
        EdgeRuntime.waitUntil(backgroundTask);
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            mode: 'async',
            message: `Processing ${totalLeads} leads in background. Check logs for progress.`,
            total: totalLeads
          }),
          { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // For smaller batches, wait for result
      const result = await processBatch(supabase, leads, sourceHeader, requestId);
      const duration = Date.now() - startTime;
      console.log(`[${requestId}] Completed in ${duration}ms`);

      return new Response(
        JSON.stringify({ success: true, mode: 'sync', duration_ms: duration, ...result }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============ SINGLE LEAD MODE ============
    const result = await processLead(supabase, body as LeadPayload, sourceHeader, requestId);
    
    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Completed in ${duration}ms - Action: ${result.action}`);

    return new Response(
      JSON.stringify({ 
        success: result.success, 
        action: result.action, 
        client_id: result.client_id,
        source: (body as LeadPayload).source || sourceHeader,
        event_id: result.event_id,
        error: result.error,
        duration_ms: duration
      }),
      { status: result.success ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error(`[${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
