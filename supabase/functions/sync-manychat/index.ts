import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SyncRequest {
  dry_run?: boolean;
  search_type?: 'email' | 'phone' | 'tag';
  search_value?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const manychatApiKey = Deno.env.get('MANYCHAT_API_KEY');

    if (!manychatApiKey) {
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'MANYCHAT_API_KEY required',
          help: 'Add your ManyChat API key in Settings → Secrets'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body: SyncRequest = await req.json().catch(() => ({}));
    const dryRun = body.dry_run ?? false;

    console.log(`[sync-manychat] Starting sync, dry_run=${dryRun}`);

    // Create sync run
    const { data: syncRun, error: syncError } = await supabase
      .from('sync_runs')
      .insert({
        source: 'manychat',
        status: 'running',
        dry_run: dryRun,
        metadata: { method: 'subscriber_search' }
      })
      .select()
      .single();

    if (syncError) {
      console.error('[sync-manychat] Failed to create sync run:', syncError);
      throw syncError;
    }

    const syncRunId = syncRun.id;
    let totalFetched = 0;
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalConflicts = 0;

    // Strategy: Get subscribers from existing clients who have manychat IDs
    // AND sync any new subscribers by searching for emails we already know
    
    // First, get all clients with emails that might be in ManyChat
    const { data: existingClients, error: clientsError } = await supabase
      .from('clients')
      .select('email, phone, manychat_subscriber_id')
      .not('email', 'is', null)
      .limit(500);

    if (clientsError) {
      console.error('[sync-manychat] Error fetching clients:', clientsError);
    }

    const emailsToSearch = existingClients?.filter(c => c.email && !c.manychat_subscriber_id).map(c => c.email) || [];
    
    console.log(`[sync-manychat] Found ${emailsToSearch.length} clients without ManyChat ID to search`);

    // Search ManyChat for each email (batched to avoid rate limits)
    for (const email of emailsToSearch.slice(0, 100)) { // Limit to 100 per run
      try {
        // Use findBySystemField endpoint to search by email
        const searchResponse = await fetch(
          'https://api.manychat.com/fb/subscriber/findBySystemField',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${manychatApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              field_name: 'email',
              field_value: email
            })
          }
        );

        if (!searchResponse.ok) {
          if (searchResponse.status === 404) {
            // Not found in ManyChat, skip
            totalSkipped++;
            continue;
          }
          console.error(`[sync-manychat] Search error for ${email}: ${searchResponse.status}`);
          totalSkipped++;
          continue;
        }

        const searchData = await searchResponse.json();
        
        if (searchData.status !== 'success' || !searchData.data) {
          totalSkipped++;
          continue;
        }

        const subscriber = searchData.data;
        totalFetched++;

        // Store raw data for audit
        if (!dryRun) {
          await supabase
            .from('manychat_contacts_raw')
            .upsert({
              subscriber_id: subscriber.id,
              payload: subscriber,
              sync_run_id: syncRunId,
              fetched_at: new Date().toISOString()
            }, { onConflict: 'subscriber_id' });
        }

        // Extract fields
        const subEmail = subscriber.email || email;
        const phone = subscriber.phone || subscriber.whatsapp_phone || null;
        const fullName = [subscriber.first_name, subscriber.last_name].filter(Boolean).join(' ') || subscriber.name || null;
        const tags = (subscriber.tags || []).map((t: any) => t.name || t);
        const waOptIn = subscriber.optin_whatsapp === true;
        const smsOptIn = subscriber.optin_sms === true;
        const emailOptIn = subscriber.optin_email !== false;

        // Call merge function
        const { data: mergeResult, error: mergeError } = await supabase.rpc('merge_contact', {
          p_source: 'manychat',
          p_external_id: subscriber.id,
          p_email: subEmail,
          p_phone: phone,
          p_full_name: fullName,
          p_tags: tags,
          p_wa_opt_in: waOptIn,
          p_sms_opt_in: smsOptIn,
          p_email_opt_in: emailOptIn,
          p_extra_data: subscriber,
          p_dry_run: dryRun,
          p_sync_run_id: syncRunId
        });

        if (mergeError) {
          console.error(`[sync-manychat] Merge error for ${subscriber.id}:`, mergeError);
          totalSkipped++;
          continue;
        }

        const action = mergeResult?.action || 'none';
        if (action === 'inserted') totalInserted++;
        else if (action === 'updated') totalUpdated++;
        else if (action === 'conflict') totalConflicts++;
        else totalSkipped++;

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (subError) {
        console.error(`[sync-manychat] Error searching for ${email}:`, subError);
        totalSkipped++;
      }
    }

    // Mark sync as complete
    await supabase
      .from('sync_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_fetched: totalFetched,
        total_inserted: totalInserted,
        total_updated: totalUpdated,
        total_skipped: totalSkipped,
        total_conflicts: totalConflicts,
        metadata: { 
          method: 'subscriber_search',
          emails_searched: emailsToSearch.length
        }
      })
      .eq('id', syncRunId);

    console.log(`[sync-manychat] Completed: ${totalFetched} found, ${totalInserted} inserted, ${totalUpdated} updated, ${totalConflicts} conflicts`);

    return new Response(
      JSON.stringify({
        success: true,
        sync_run_id: syncRunId,
        dry_run: dryRun,
        stats: {
          emails_searched: Math.min(emailsToSearch.length, 100),
          total_fetched: totalFetched,
          total_inserted: totalInserted,
          total_updated: totalUpdated,
          total_skipped: totalSkipped,
          total_conflicts: totalConflicts
        },
        note: 'ManyChat API requires searching by email/phone. Synced clients that exist in both systems.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[sync-manychat] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message || 'Unknown error',
        help: 'ManyChat API does not support listing all subscribers. Use webhook integration instead for real-time sync.'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
