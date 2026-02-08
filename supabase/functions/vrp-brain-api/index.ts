import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

type EmbeddingResponse = { data?: Array<{ embedding?: number[] }> };

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`[${requestId}] vrp-brain-api: Start`);

  try {
    // ========== SECURITY CHECK ==========
    // Support both:
    // 1) x-admin-key (VRP_ADMIN_KEY) for server-to-server ingestion scripts
    // 2) Authorization: Bearer <user JWT> for in-app admin users (validated via is_admin()).
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    if (!supabaseUrl || !supabaseAnonKey) {
      return jsonResponse(500, {
        ok: false,
        error: "Missing SUPABASE_URL / SUPABASE_ANON_KEY",
        requestId,
      });
    }

    const adminKey = Deno.env.get("VRP_ADMIN_KEY") || "";
    const providedAdminKey = req.headers.get("x-admin-key") || "";
    const authHeader = req.headers.get("Authorization") || "";

    let authMode: "admin_key" | "jwt_is_admin" | null = null;
    let requesterEmail: string | null = null;

    if (adminKey && providedAdminKey && providedAdminKey === adminKey) {
      authMode = "admin_key";
    } else if (authHeader.startsWith("Bearer ")) {
      const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      });

      const { data: userData, error: userError } = await authClient.auth.getUser();
      const user = userData?.user;

      if (userError || !user) {
        console.warn(
          `[${requestId}] Unauthorized - invalid/expired JWT`,
          userError?.message,
        );
        return jsonResponse(401, {
          ok: false,
          error: "Unauthorized",
          message: "Invalid or expired token",
          requestId,
        });
      }

      const { data: isAdmin, error: adminError } = await authClient.rpc("is_admin");
      if (adminError || !isAdmin) {
        console.warn(`[${requestId}] Forbidden - not admin`, adminError?.message);
        return jsonResponse(403, {
          ok: false,
          error: "Forbidden",
          message: "User is not an admin",
          requestId,
        });
      }

      authMode = "jwt_is_admin";
      requesterEmail = user.email ?? null;
    } else {
      console.warn(`[${requestId}] Unauthorized - missing auth`);
      return jsonResponse(401, {
        ok: false,
        error: "Unauthorized",
        message: "Provide x-admin-key or Authorization: Bearer <token>",
        requestId,
      });
    }

    // ========== PARSE BODY ==========
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse(400, { ok: false, error: "Invalid JSON body", requestId });
    }

    const { action, ...params } = body as Record<string, unknown>;
    if (!action || typeof action !== "string") {
      return jsonResponse(400, { ok: false, error: "Missing action field", requestId });
    }

    console.log(`[${requestId}] Action: ${action}`);

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!serviceRoleKey) {
      return jsonResponse(500, {
        ok: false,
        error: "Missing SUPABASE_SERVICE_ROLE_KEY",
        requestId,
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Supabase vector types are commonly represented as strings (e.g. "[0.1,0.2,...]").
    // Accept either a vector-string or a JSON array of numbers for convenience.
    const toVectorString = (value: unknown): string | undefined => {
      if (typeof value === "string") return value;
      if (Array.isArray(value) && value.every((n) => typeof n === "number")) {
        return `[${value.join(",")}]`;
      }
      return undefined;
    };

    const embeddingModel = Deno.env.get("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small"; // 1536 dims
    const openAiApiKey = Deno.env.get("OPENAI_API_KEY") || "";

    const createEmbedding = async (input: string): Promise<number[]> => {
      if (!openAiApiKey) throw new Error("OPENAI_API_KEY not configured");

      const resp = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openAiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: embeddingModel, input }),
      });

      const text = await resp.text();
      if (!resp.ok) {
        throw new Error(`OpenAI embeddings failed (${resp.status}): ${text.slice(0, 200)}`);
      }

      const json = JSON.parse(text) as EmbeddingResponse;
      const embedding = json?.data?.[0]?.embedding;
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error("OpenAI embeddings returned empty embedding");
      }
      return embedding;
    };

    let result: unknown = null;

    // ========== ACTION ROUTER ==========
    switch (action) {
      case "identify": {
        // Prefer v2, but keep v1 fallback for older DB setups.
        const v2 = await supabase.rpc("unify_identity_v2", params);
        if (!v2.error) {
          result = v2.data;
          break;
        }
        const v1 = await supabase.rpc("unify_identity", params);
        if (v1.error) {
          return jsonResponse(400, { ok: false, error: v1.error.message, details: v1.error, requestId });
        }
        result = v1.data;
        break;
      }

      case "history": {
        const p = params as Record<string, unknown>;
        const contactId = typeof p.contact_id === "string" ? p.contact_id.trim() : "";
        const platform = typeof p.platform === "string" ? p.platform.trim() : "";
        const limitRaw = p.limit;
        let limit = 40;
        if (typeof limitRaw === "number" && Number.isFinite(limitRaw)) {
          limit = Math.max(1, Math.min(200, Math.floor(limitRaw)));
        } else if (typeof limitRaw === "string") {
          const n = Number.parseInt(limitRaw, 10);
          if (Number.isFinite(n)) limit = Math.max(1, Math.min(200, n));
        }

        if (!contactId) {
          return jsonResponse(400, { ok: false, error: "history requires contact_id", requestId });
        }

        let q = supabase
          .from("chat_events")
          .select("created_at,platform,sender,message,contact_id,meta")
          .eq("contact_id", contactId);
        if (platform) q = q.eq("platform", platform);
        const historyRes = await q.order("created_at", { ascending: true }).limit(limit);
        if (historyRes.error) {
          return jsonResponse(400, {
            ok: false,
            error: historyRes.error.message,
            details: historyRes.error,
            requestId,
          });
        }
        result = historyRes.data;
        break;
      }

      case "search": {
        const p = params as Record<string, unknown>;

        // Allow query_embedding as a number[] or accept query_text and embed server-side.
        if (Array.isArray(p?.query_embedding)) {
          const vec = toVectorString(p.query_embedding);
          if (vec) p.query_embedding = vec;
        } else if (typeof p?.query_text === "string" && !p?.query_embedding) {
          const queryText = String(p.query_text).trim();
          if (!queryText) {
            return jsonResponse(400, {
              ok: false,
              error: "search requires query_embedding or non-empty query_text",
              requestId,
            });
          }
          const embedding = await createEmbedding(queryText);
          p.query_embedding = toVectorString(embedding);
          delete p.query_text;
        }

        const searchResult = await supabase.rpc("match_knowledge", p);
        if (searchResult.error) {
          return jsonResponse(400, {
            ok: false,
            error: searchResult.error.message,
            details: searchResult.error,
            requestId,
          });
        }
        result = searchResult.data;
        break;
      }

      case "insert": {
        const p = params as Record<string, unknown>;
        const table = p.table;
        const data = p.data;

        // Whitelist allowed tables for security
        const allowedTables = ["chat_events", "lead_events", "vrp_knowledge"];
        if (typeof table !== "string" || !table || data === undefined || data === null) {
          return jsonResponse(400, {
            ok: false,
            error: 'Insert requires "table" and "data" fields',
            requestId,
          });
        }
        if (!allowedTables.includes(table)) {
          console.warn(`[${requestId}] Blocked insert attempt to table: ${table}`);
          return jsonResponse(403, {
            ok: false,
            error: `Table '${table}' not allowed for insertion`,
            requestId,
          });
        }

        // If inserting vectors, accept embedding as number[] and convert to vector string.
        // Also supports batch inserts: data can be an object or an array of objects.
        if (table === "vrp_knowledge") {
          const rows = Array.isArray(data) ? data : [data];
          for (const row of rows) {
            if (!row || typeof row !== "object") {
              return jsonResponse(400, { ok: false, error: "vrp_knowledge insert requires object rows", requestId });
            }
            const d = row as Record<string, unknown>;

            // If no embedding provided, compute on the server (uses OPENAI_API_KEY).
            if (d.embedding === undefined || d.embedding === null || d.embedding === "") {
              const content = typeof d.content === "string" ? d.content.trim() : "";
              if (!content) {
                return jsonResponse(400, {
                  ok: false,
                  error: "vrp_knowledge insert requires non-empty content",
                  requestId,
                });
              }
              const embedding = await createEmbedding(content);
              d.embedding = toVectorString(embedding);
            }

            if (Array.isArray(d.embedding)) {
              const vec = toVectorString(d.embedding);
              if (vec) d.embedding = vec;
            }
          }
        }

        // Avoid returning huge payloads for batch inserts.
        const isBatch = Array.isArray(data);
        const insertQuery = isBatch
          ? supabase.from(table).insert(data)
          : supabase.from(table).insert(data).select();
        const insertResult = await insertQuery;
        if (insertResult.error) {
          return jsonResponse(400, {
            ok: false,
            error: insertResult.error.message,
            details: insertResult.error,
            requestId,
          });
        }

        result = insertResult.data ?? (isBatch ? { inserted: (data as unknown[]).length } : null);
        break;
      }

      default:
        console.warn(`[${requestId}] Unknown action: ${action}`);
        return jsonResponse(400, { ok: false, error: `Unknown action: ${action}`, requestId });
    }

    console.log(
      `[${requestId}] Success (${authMode}${requesterEmail ? `:${requesterEmail}` : ""})`,
    );
    return jsonResponse(200, { ok: true, data: result, requestId });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    console.error(`[${requestId}] Fatal error:`, err);
    return jsonResponse(500, { ok: false, error: errorMessage, requestId });
  }
});
