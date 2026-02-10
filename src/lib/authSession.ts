import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

let refreshInFlight: Promise<Session | null> | null = null;
let lastRefreshAtMs = 0;
let restoreInFlight: Promise<Session | null> | null = null;
let lastRestoreAtMs = 0;

const SESSION_BACKUP_KEY = "vrp:supabase-session-backup:v1";

type SessionBackup = {
  access_token: string;
  refresh_token: string;
  expires_at: number | null;
  user_id: string | null;
  saved_at: string; // ISO timestamp
};

function canUseLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

function readSessionBackup(): SessionBackup | null {
  if (!canUseLocalStorage()) return null;
  try {
    const raw = localStorage.getItem(SESSION_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionBackup> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.access_token !== "string" || parsed.access_token.length < 20) return null;
    if (typeof parsed.refresh_token !== "string" || parsed.refresh_token.length < 20) return null;
    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      expires_at: typeof parsed.expires_at === "number" ? parsed.expires_at : null,
      user_id: typeof parsed.user_id === "string" ? parsed.user_id : null,
      saved_at: typeof parsed.saved_at === "string" ? parsed.saved_at : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function saveSessionBackup(session: Session | null): void {
  if (!canUseLocalStorage()) return;
  if (!session) return;
  if (!session.access_token || !session.refresh_token) return;
  const backup: SessionBackup = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: typeof session.expires_at === "number" ? session.expires_at : null,
    user_id: session.user?.id ?? null,
    saved_at: new Date().toISOString(),
  };
  try {
    localStorage.setItem(SESSION_BACKUP_KEY, JSON.stringify(backup));
  } catch {
    // ignore storage errors
  }
}

export function clearSessionBackup(): void {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.removeItem(SESSION_BACKUP_KEY);
  } catch {
    // ignore
  }
}

function isSessionExpiringSoon(session: Session, withinMs: number): boolean {
  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : 0;
  if (!expiresAtMs) return false;
  return expiresAtMs - Date.now() <= withinMs;
}

async function withCrossTabLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  // Use the Web Locks API when available to avoid refresh-token rotation races across tabs.
  // If unsupported (e.g. some Safari versions) fall back to best-effort in-tab locking.
  const locks = (globalThis as any)?.navigator?.locks as
    | { request?: (name: string, options: any, callback: () => Promise<T>) => Promise<T> }
    | undefined;

  if (locks?.request) {
    try {
      return await locks.request(name, { mode: "exclusive" }, fn);
    } catch {
      // Ignore lock failures and proceed without cross-tab coordination.
    }
  }
  return fn();
}

async function getSessionFromStorage(): Promise<Session | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session ?? null;
  } catch {
    return null;
  }
}

async function restoreSessionFromBackupNoLock(): Promise<Session | null> {
  const backup = readSessionBackup();
  if (!backup) return null;

  try {
    const { data, error } = await supabase.auth.setSession({
      access_token: backup.access_token,
      refresh_token: backup.refresh_token,
    });
    if (error) return null;
    const session = data.session ?? null;
    if (session) saveSessionBackup(session);
    return session;
  } catch {
    return null;
  }
}

/**
 * Restore a session if Supabase storage was cleared (common cause of "random" logouts).
 * Uses the same cross-tab lock as refresh to avoid refresh-token rotation races.
 */
export async function restoreSessionFromBackupLocked(opts?: { minIntervalMs?: number }): Promise<Session | null> {
  const minIntervalMs = opts?.minIntervalMs ?? 15_000;

  if (Date.now() - lastRestoreAtMs < minIntervalMs) return null;

  if (!restoreInFlight) {
    restoreInFlight = withCrossTabLock("vrp:supabase-refresh-session", async () => {
      try {
        // If another tab already restored, use that.
        const existing = await getSessionFromStorage();
        if (existing) {
          saveSessionBackup(existing);
          lastRestoreAtMs = Date.now();
          return existing;
        }

        const restored = await restoreSessionFromBackupNoLock();
        if (restored) {
          lastRestoreAtMs = Date.now();
          return restored;
        }

        return null;
      } finally {
        restoreInFlight = null;
      }
    });
  }

  return restoreInFlight;
}

export async function getSessionSafe(): Promise<Session | null> {
  const fromStorage = await getSessionFromStorage();
  if (fromStorage) {
    saveSessionBackup(fromStorage);
    return fromStorage;
  }

  // If storage is empty but we have a backup, try to restore once.
  return restoreSessionFromBackupLocked({ minIntervalMs: 15_000 });
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
    refreshInFlight = withCrossTabLock("vrp:supabase-refresh-session", async () => {
      try {
        // Another tab may have refreshed while we waited for the lock. Re-check first.
        // getSessionSafe() also tries backup-restore if storage got cleared.
        const existing = await getSessionSafe();
        if (existing && !isSessionExpiringSoon(existing, 60_000)) {
          lastRefreshAtMs = Date.now();
          return existing;
        }

        const { data, error } = await supabase.auth.refreshSession();
        if (error) {
          // If refresh fails because storage lost the refresh token, try restoring once and retry.
          const restored = await restoreSessionFromBackupNoLock();
          if (!restored) return null;
          const retry = await supabase.auth.refreshSession();
          if (retry.error) return null;
          const next = retry.data.session ?? null;
          if (next) saveSessionBackup(next);
          lastRefreshAtMs = Date.now();
          return next;
        }
        lastRefreshAtMs = Date.now();
        if (data.session) saveSessionBackup(data.session);
        return data.session ?? null;
      } catch {
        return null;
      } finally {
        refreshInFlight = null;
      }
    });
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
