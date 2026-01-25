import { supabase } from "@/integrations/supabase/client";

/**
 * SECURE: No hardcoded API keys. Uses authenticated Supabase session.
 * Edge functions verify JWT + is_admin() server-side.
 */

/**
 * Generic wrapper for invoking Edge Functions with type safety.
 * Uses the active Supabase session JWT for authentication.
 * 
 * @template T - Response type (defaults to Record<string, unknown> for compatibility)
 * @template B - Body type (defaults to Record<string, unknown>)
 */
export async function invokeWithAdminKey<
  T = Record<string, unknown>,
  B extends Record<string, unknown> = Record<string, unknown>
>(
  functionName: string,
  body?: B
): Promise<T | null> {
  try {
    // Get current session - the SDK automatically includes the JWT in requests
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      console.error('[AdminAPI] No active session');
      return null;
    }

    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
    });

    if (error) {
      console.error(`[AdminAPI] ${functionName} error:`, error);
      // Return the error as part of the response instead of throwing
      return { success: false, error: error.message } as T;
    }

    return data as T;
  } catch (e) {
    console.error(`[AdminAPI] ${functionName} fatal:`, e);
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' } as T;
  }
}

// Helper to get admin headers (for compatibility - now just returns empty since JWT is automatic)
export const getAdminHeaders = (): Record<string, string> => {
  return {
    'Content-Type': 'application/json',
  };
};

export default invokeWithAdminKey;
