import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ManyChatRequest {
  subscriber_id?: string;
  email?: string;
  phone?: string;
  message: string;
  client_id?: string;
  template?: 'friendly' | 'urgent' | 'final' | 'custom';
  client_name?: string;
  amount?: number;
  tag?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const MANYCHAT_API_KEY = Deno.env.get('MANYCHAT_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    if (!MANYCHAT_API_KEY) {
      console.error('Missing ManyChat API key');
      return new Response(
        JSON.stringify({ error: 'ManyChat API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const payload: ManyChatRequest = await req.json();
    console.log('ManyChat Request received:', { 
      email: payload.email, 
      phone: payload.phone,
      template: payload.template 
    });

    // Build message based on template
    let message = payload.message;
    if (payload.template && payload.template !== 'custom') {
      const name = payload.client_name || 'Cliente';
      const amount = payload.amount ? `$${(payload.amount / 100).toFixed(2)}` : '';
      
      switch (payload.template) {
        case 'friendly':
          message = `Hola ${name} 👋 Notamos que tu pago de ${amount} no se procesó correctamente. ¿Podemos ayudarte a resolverlo? Responde a este mensaje.`;
          break;
        case 'urgent':
          message = `⚠️ ${name}, tu cuenta tiene un pago pendiente de ${amount}. Para evitar la suspensión del servicio, actualiza tu método de pago hoy.`;
          break;
        case 'final':
          message = `🚨 ÚLTIMO AVISO: ${name}, tu servicio será suspendido en 24h por falta de pago (${amount}). Contáctanos urgentemente para evitarlo.`;
          break;
      }
    }

    let subscriberId = payload.subscriber_id;

    // If no subscriber_id, try to find by email or phone
    if (!subscriberId && (payload.email || payload.phone)) {
      console.log('Searching for subscriber by email/phone...');
      
      // Search by email first
      if (payload.email) {
        const searchResponse = await fetch(
          `https://api.manychat.com/fb/subscriber/findBySystemField?field=email&value=${encodeURIComponent(payload.email)}`,
          {
            headers: {
              'Authorization': `Bearer ${MANYCHAT_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        const searchResult = await searchResponse.json();
        console.log('Email search result:', searchResult);
        
        if (searchResult.status === 'success' && searchResult.data?.id) {
          subscriberId = searchResult.data.id;
        }
      }
      
      // If not found by email, try phone
      if (!subscriberId && payload.phone) {
        // Clean phone number
        const cleanPhone = payload.phone.replace(/[^\d+]/g, '');
        
        const searchResponse = await fetch(
          `https://api.manychat.com/fb/subscriber/findBySystemField?field=phone&value=${encodeURIComponent(cleanPhone)}`,
          {
            headers: {
              'Authorization': `Bearer ${MANYCHAT_API_KEY}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        const searchResult = await searchResponse.json();
        console.log('Phone search result:', searchResult);
        
        if (searchResult.status === 'success' && searchResult.data?.id) {
          subscriberId = searchResult.data.id;
        }
      }
    }

    if (!subscriberId) {
      console.log('Subscriber not found in ManyChat');
      return new Response(
        JSON.stringify({ 
          error: 'Subscriber not found in ManyChat',
          details: 'The email or phone is not registered as a ManyChat subscriber'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Sending message to subscriber:', subscriberId);

    // Send message via ManyChat
    const sendResponse = await fetch('https://api.manychat.com/fb/sending/sendContent', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MANYCHAT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subscriber_id: subscriberId,
        data: {
          version: 'v2',
          content: {
            messages: [
              {
                type: 'text',
                text: message,
              }
            ]
          }
        }
      }),
    });

    const sendResult = await sendResponse.json();
    console.log('ManyChat send response:', sendResult);

    // Add tag if provided
    if (payload.tag && subscriberId) {
      await fetch('https://api.manychat.com/fb/subscriber/addTagByName', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MANYCHAT_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subscriber_id: subscriberId,
          tag_name: payload.tag,
        }),
      });
      console.log('Tag added:', payload.tag);
    }

    if (sendResult.status !== 'success') {
      console.error('ManyChat error:', sendResult);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to send message', 
          details: sendResult.message || sendResult 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log event to client_events if client_id provided
    if (payload.client_id) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      await supabase.from('client_events').insert({
        client_id: payload.client_id,
        event_type: 'email_sent', // Using email_sent as closest match
        metadata: {
          channel: 'manychat',
          template: payload.template || 'custom',
          subscriber_id: subscriberId,
          tag: payload.tag,
        }
      });
      
      console.log('Event logged for client:', payload.client_id);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        subscriber_id: subscriberId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in send-manychat:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
