import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ExecuteFlowPayload {
  flow_id: string;
  client_id: string;
  trigger_event: string;
}

interface FlowNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload: ExecuteFlowPayload = await req.json();
    const { flow_id, client_id, trigger_event } = payload;

    console.log(`[execute-flow] Starting flow ${flow_id} for client ${client_id}, trigger: ${trigger_event}`);

    // 1. Load the flow
    const { data: flow, error: flowError } = await supabase
      .from("automation_flows")
      .select("*")
      .eq("id", flow_id)
      .single();

    if (flowError || !flow) {
      throw new Error(`Flow not found: ${flowError?.message}`);
    }

    if (!flow.is_active) {
      return new Response(
        JSON.stringify({ success: false, message: "Flow is not active" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get client data for variable substitution
    const { data: client } = await supabase
      .from("clients")
      .select("*")
      .eq("id", client_id)
      .single();

    // 3. Create execution record
    const { data: execution, error: execError } = await supabase
      .from("flow_executions")
      .insert({
        flow_id,
        client_id,
        trigger_event,
        status: "running",
        execution_log: [],
      })
      .select()
      .single();

    if (execError) {
      throw new Error(`Failed to create execution: ${execError.message}`);
    }

    const nodes: FlowNode[] = flow.nodes_json as FlowNode[];
    const edges: FlowEdge[] = flow.edges_json as FlowEdge[];
    const executionLog: Array<{ node_id: string; type: string; status: string; timestamp: string; details?: string }> = [];

    // 4. Find the trigger node (start point)
    const triggerNode = nodes.find((n) => n.type === "trigger");
    if (!triggerNode) {
      throw new Error("Flow has no trigger node");
    }

    // 5. Execute nodes sequentially following edges
    let currentNodeId = triggerNode.id;
    let nodesProcessed = 0;
    const maxNodes = 50; // Safety limit

    while (currentNodeId && nodesProcessed < maxNodes) {
      const currentNode = nodes.find((n) => n.id === currentNodeId);
      if (!currentNode) break;

      console.log(`[execute-flow] Processing node: ${currentNode.type} (${currentNode.id})`);

      try {
        const result = await executeNode(supabase, currentNode, client, client_id);
        
        executionLog.push({
          node_id: currentNode.id,
          type: currentNode.type,
          status: "success",
          timestamp: new Date().toISOString(),
          details: result.message,
        });

        // Find next node
        let nextEdge: FlowEdge | undefined;
        
        if (currentNode.type === "condition") {
          // For condition nodes, follow the appropriate branch
          const handleId = result.conditionResult ? "true" : "false";
          nextEdge = edges.find((e) => e.source === currentNodeId && e.sourceHandle === handleId);
        } else {
          nextEdge = edges.find((e) => e.source === currentNodeId);
        }

        currentNodeId = nextEdge?.target || "";
        
        // If it's an end node, stop
        if (currentNode.type === "end") {
          break;
        }

        // If delay node, schedule continuation and exit
        if (currentNode.type === "delay" && result.delayMs && result.delayMs > 0) {
          // For now, we'll just log it. In production, use a job queue
          console.log(`[execute-flow] Delay node: would wait ${result.delayMs}ms before continuing`);
          // Mark as paused for delayed continuation
          await supabase
            .from("flow_executions")
            .update({
              status: "paused",
              current_node_id: currentNodeId,
              execution_log: executionLog,
            })
            .eq("id", execution.id);
          
          return new Response(
            JSON.stringify({ success: true, status: "paused", execution_id: execution.id }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } catch (nodeError) {
        executionLog.push({
          node_id: currentNode.id,
          type: currentNode.type,
          status: "error",
          timestamp: new Date().toISOString(),
          details: (nodeError as Error).message,
        });
        
        // Update execution as failed
        await supabase
          .from("flow_executions")
          .update({
            status: "failed",
            completed_at: new Date().toISOString(),
            execution_log: executionLog,
            error_message: (nodeError as Error).message,
          })
          .eq("id", execution.id);

        throw nodeError;
      }

      nodesProcessed++;
    }

    // 6. Mark execution as completed
    await supabase
      .from("flow_executions")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        execution_log: executionLog,
      })
      .eq("id", execution.id);

    // 7. Update flow statistics
    await supabase
      .from("automation_flows")
      .update({
        total_executions: flow.total_executions + 1,
        successful_executions: flow.successful_executions + 1,
      })
      .eq("id", flow_id);

    console.log(`[execute-flow] Flow completed successfully`);

    return new Response(
      JSON.stringify({ success: true, execution_id: execution.id, nodes_processed: nodesProcessed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[execute-flow] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function executeNode(
  supabase: any,
  node: FlowNode,
  client: Record<string, unknown> | null,
  clientId: string
): Promise<{ message: string; conditionResult?: boolean; delayMs?: number }> {
  const data = node.data;

  switch (node.type) {
    case "trigger":
      return { message: "Trigger activated" };

    case "message": {
      const channel = data.channel as string || "whatsapp";
      let message = data.customMessage as string || "";
      
      // Replace variables
      if (client) {
        message = message
          .replace(/\{\{name\}\}/g, client.full_name as string || "")
          .replace(/\{\{email\}\}/g, client.email as string || "")
          .replace(/\{\{phone\}\}/g, client.phone as string || "")
          .replace(/\{\{amount\}\}/g, String(client.total_spend || 0));
      }

      // Call the appropriate messaging function
      if (channel === "whatsapp" || channel === "sms") {
        const phone = client?.phone_e164 || client?.phone;
        if (phone) {
          // Call notify-ghl or send-sms
          const { error } = await supabase.functions.invoke("notify-ghl", {
            body: { contactId: client?.ghl_contact_id, message },
          });
          if (error) console.warn("Message send warning:", error);
        }
      }

      return { message: `Sent ${channel} message` };
    }

    case "delay": {
      const duration = data.duration as number || 1;
      const unit = data.unit as string || "hours";
      
      let delayMs = duration * 1000; // Start with seconds
      if (unit === "minutes") delayMs = duration * 60 * 1000;
      else if (unit === "hours") delayMs = duration * 60 * 60 * 1000;
      else if (unit === "days") delayMs = duration * 24 * 60 * 60 * 1000;

      return { message: `Delay: ${duration} ${unit}`, delayMs };
    }

    case "condition": {
      const field = data.field as string;
      const operator = data.operator as string;
      const targetValue = data.value;
      
      let clientValue: unknown = null;
      if (client && field) {
        if (field === "has_tag") {
          clientValue = (client.tags as string[] || []).includes(targetValue as string);
        } else {
          clientValue = client[field];
        }
      }

      let result = false;
      switch (operator) {
        case "equals":
          result = clientValue === targetValue;
          break;
        case "not_equals":
          result = clientValue !== targetValue;
          break;
        case "greater_than":
          result = Number(clientValue) > Number(targetValue);
          break;
        case "less_than":
          result = Number(clientValue) < Number(targetValue);
          break;
        case "contains":
          result = String(clientValue).includes(String(targetValue));
          break;
      }

      return { message: `Condition: ${field} ${operator} ${targetValue} = ${result}`, conditionResult: result };
    }

    case "tag": {
      const action = data.action as string;
      const tagName = data.tagName as string;
      
      if (tagName && clientId) {
        const currentTags = (client?.tags as string[]) || [];
        let newTags: string[];
        
        if (action === "add") {
          newTags = [...new Set([...currentTags, tagName])];
        } else {
          newTags = currentTags.filter((t) => t !== tagName);
        }

        await supabase
          .from("clients")
          .update({ tags: newTags })
          .eq("id", clientId);
      }

      return { message: `Tag ${action}: ${tagName}` };
    }

    case "webhook": {
      const url = data.url as string;
      const method = (data.method as string) || "POST";
      let body = data.body as string || "";
      
      // Replace variables in body
      if (client) {
        body = body
          .replace(/\{\{client_id\}\}/g, clientId)
          .replace(/\{\{name\}\}/g, client.full_name as string || "")
          .replace(/\{\{email\}\}/g, client.email as string || "");
      }

      if (url) {
        try {
          const response = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: method === "POST" ? body : undefined,
          });
          return { message: `Webhook ${method} ${url}: ${response.status}` };
        } catch (e) {
          return { message: `Webhook failed: ${(e as Error).message}` };
        }
      }
      return { message: "Webhook: No URL configured" };
    }

    case "end":
      return { message: "Flow ended" };

    default:
      return { message: `Unknown node type: ${node.type}` };
  }
}
