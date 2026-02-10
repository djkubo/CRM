type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function pickString(obj: UnknownRecord, key: string): string | null {
  const v = obj[key];
  if (typeof v === "string" && v.trim()) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function safeJsonStringify(value: unknown, maxLen: number): string {
  const seen = new WeakSet<object>();
  const json = JSON.stringify(
    value,
    (_key, v) => {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v)) return "[Circular]";
        seen.add(v);
      }
      return v;
    },
    2,
  );

  if (json.length <= maxLen) return json;
  return json.slice(0, Math.max(0, maxLen - 3)) + "...";
}

export function formatUnknownError(
  error: unknown,
  opts?: { fallback?: string; maxLen?: number; includeDetails?: boolean },
): string {
  const fallback = opts?.fallback ?? "Error desconocido";
  const maxLen = opts?.maxLen ?? 320;
  const includeDetails = opts?.includeDetails ?? true;

  if (error == null) return fallback;
  if (typeof error === "string") return error;
  if (typeof error === "number" || typeof error === "boolean" || typeof error === "bigint") return String(error);

  if (error instanceof Error) {
    const msg = (error.message || error.name || fallback).trim();
    return msg.length > maxLen ? msg.slice(0, Math.max(0, maxLen - 3)) + "..." : msg;
  }

  if (Array.isArray(error)) {
    // Avoid "[object Object]" when APIs return an array of errors.
    try {
      return safeJsonStringify(error, maxLen);
    } catch {
      return fallback;
    }
  }

  if (isRecord(error)) {
    // Supabase/PostgREST often returns plain objects with message/details/hint/code.
    const message =
      pickString(error, "message") ??
      pickString(error, "error") ??
      pickString(error, "msg") ??
      pickString(error, "description");

    const details = includeDetails ? pickString(error, "details") ?? pickString(error, "hint") : null;

    const combined = [message, details].filter(Boolean).join(" - ");
    if (combined) return combined.length > maxLen ? combined.slice(0, Math.max(0, maxLen - 3)) + "..." : combined;

    // Fall back to JSON if there is no clear message.
    try {
      const json = safeJsonStringify(error, maxLen);
      return json && json !== "{}" ? json : fallback;
    } catch {
      return fallback;
    }
  }

  const msg = String(error);
  if (msg && msg !== "[object Object]") return msg.length > maxLen ? msg.slice(0, Math.max(0, maxLen - 3)) + "..." : msg;
  return fallback;
}

