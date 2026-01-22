import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SNSMessage {
  Type: string;
  MessageId: string;
  TopicArn?: string;
  Message: string;
  Timestamp: string;
  SubscribeURL?: string;
}

interface SESNotification {
  notificationType: string;
  mail: {
    messageId: string;
    source: string;
    destination: string[];
    timestamp: string;
    commonHeaders?: {
      subject?: string;
      from?: string[];
      to?: string[];
    };
  };
  bounce?: {
    bounceType: string;
    bouncedRecipients: Array<{ emailAddress: string }>;
  };
  complaint?: {
    complainedRecipients: Array<{ emailAddress: string }>;
  };
  delivery?: {
    recipients: string[];
    timestamp: string;
  };
  open?: {
    ipAddress: string;
    timestamp: string;
  };
  click?: {
    ipAddress: string;
    timestamp: string;
    link: string;
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.text();
    let snsMessage: SNSMessage;

    try {
      snsMessage = JSON.parse(body);
    } catch {
      console.error("❌ Invalid JSON body");
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("📨 SES notification received:", snsMessage.Type);

    // Handle SNS subscription confirmation
    if (snsMessage.Type === "SubscriptionConfirmation") {
      console.log("🔗 SNS Subscription confirmation - URL:", snsMessage.SubscribeURL);
      
      // Auto-confirm the subscription
      if (snsMessage.SubscribeURL) {
        try {
          const confirmResponse = await fetch(snsMessage.SubscribeURL);
          console.log("✅ Subscription confirmed:", confirmResponse.status);
        } catch (e) {
          console.error("❌ Failed to confirm subscription:", e);
        }
      }
      
      return new Response(JSON.stringify({ status: "subscription_confirmed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Process notification
    if (snsMessage.Type === "Notification") {
      let notification: SESNotification;
      
      try {
        notification = JSON.parse(snsMessage.Message);
      } catch {
        console.error("❌ Invalid SES message format");
        return new Response(JSON.stringify({ error: "Invalid SES message" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { notificationType, mail } = notification;
      const messageId = mail.messageId;
      const recipients = mail.destination || [];

      console.log(`📧 SES ${notificationType}:`, messageId, "to:", recipients);

      // Log webhook event for idempotency
      const { error: eventError } = await supabase.from("webhook_events").insert({
        source: "ses",
        event_id: snsMessage.MessageId,
        event_type: notificationType.toLowerCase(),
        payload: notification,
      });

      if (eventError?.code === "23505") {
        console.log("⚠️ Duplicate event, skipping");
        return new Response(JSON.stringify({ status: "duplicate" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Find client by email
      for (const email of recipients) {
        const { data: client } = await supabase
          .from("clients")
          .select("id")
          .ilike("email", email)
          .limit(1)
          .maybeSingle();

        if (client) {
          // Map SES notification type to our event types
          let eventType: string;
          switch (notificationType.toLowerCase()) {
            case "bounce":
              eventType = "email_bounce";
              break;
            case "delivery":
              eventType = "email_sent";
              break;
            case "open":
              eventType = "email_open";
              break;
            case "click":
              eventType = "email_click";
              break;
            default:
              eventType = "custom";
          }

          // Log client event
          await supabase.from("client_events").insert({
            client_id: client.id,
            event_type: eventType,
            metadata: {
              ses_message_id: messageId,
              notification_type: notificationType,
              email,
              bounce_type: notification.bounce?.bounceType,
              link_clicked: notification.click?.link,
              timestamp: notification.delivery?.timestamp || notification.open?.timestamp,
            },
          });

          console.log(`✅ Event ${eventType} logged for client:`, client.id);

          // For bounces, update email_opt_in to false
          if (notificationType.toLowerCase() === "bounce") {
            await supabase
              .from("clients")
              .update({ email_opt_in: false })
              .eq("id", client.id);
            console.log("⚠️ Marked client email_opt_in = false due to bounce");
          }
        }
      }

      // Store in messages table for tracking
      const subject = mail.commonHeaders?.subject || "Email";
      const fromAddress = mail.source || mail.commonHeaders?.from?.[0] || "noreply@example.com";

      for (const email of recipients) {
        // Update existing message status or create tracking record
        const { data: existingMsg } = await supabase
          .from("messages")
          .select("id")
          .eq("external_message_id", messageId)
          .maybeSingle();

        if (existingMsg) {
          // Update status based on notification type
          let newStatus = "sent";
          if (notificationType.toLowerCase() === "delivery") newStatus = "delivered";
          if (notificationType.toLowerCase() === "bounce") newStatus = "bounced";
          if (notificationType.toLowerCase() === "open") newStatus = "opened";

          await supabase
            .from("messages")
            .update({ status: newStatus })
            .eq("id", existingMsg.id);
        }
      }

      return new Response(
        JSON.stringify({ status: "processed", type: notificationType }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ status: "unknown_type" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("❌ SES webhook error:", error);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
