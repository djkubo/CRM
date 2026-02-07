import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

let refreshInFlight: Promise<Session | null> | null = null;
let lastRefreshAtMs = 0;

function isSessionExpiringSoon(session: Session, withinMs: number): boolean {
  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
  if (!expiresAtMs) return false;
  return expiresAtMs - Date.now() <= withinMs;
}

export async function getSessionSafe(): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session ?? null;
  } catch {
    return null;
  }
}

/**
 * Refreshes the current session, but avoids multiple concurrent refreshes which can
 * cause refresh-token rotation races (and unintended sign-outs).
 */
export async function refreshSessionLocked(opts?: { minIntervalMs?: number }): Promise<Session | null> {
  const minIntervalMs = opts?.minIntervalMs ?? 15_000;

  // Avoid hammering refresh if multiple call sites try to recover at once.
  if (Date.now() - lastRefreshAtMs < minIntervalMs) {
    return getSessionSafe();
  }

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const { data, error } = await supabase.auth.refreshSession();
        if (error) return null;
        lastRefreshAtMs = Date.now();
        return data.session ?? null;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }

  return refreshInFlight;
}

/**
 * Returns a session and refreshes only when needed (missing session or expiring soon).
 */
export async function getValidSession(opts?: {
  refreshIfExpiringWithinMs?: number;
}): Promise<Session | null> {
  const refreshIfExpiringWithinMs = opts?.refreshIfExpiringWithinMs ?? 2 * 60 * 1000;

  const session = await getSessionSafe();
  if (!session) {
    return refreshSessionLocked();
  }

  if (isSessionExpiringSoon(session, refreshIfExpiringWithinMs)) {
    return (await refreshSessionLocked()) ?? session;
  }

  return session;
}

