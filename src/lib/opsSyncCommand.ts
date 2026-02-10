export type OpsSyncSource = "stripe" | "paypal" | "stripe_invoices" | "ghl" | "manychat";

export type OpsSyncCommand = {
  source: OpsSyncSource;
  // Stripe/PayPal: last24h/last7d/last31d/all6months/allHistory
  // Invoices: last24h/last7d/last31d/full
  // CRM: mode optional (runs "now")
  mode?: string;
  force?: boolean;
};

const PENDING_KEY = "__ops_sync_pending_command__";
const EVENT_NAME = "ops-sync:command";

export function setPendingOpsSyncCommand(cmd: OpsSyncCommand) {
  (window as any)[PENDING_KEY] = cmd;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: cmd }));
}

export function consumePendingOpsSyncCommand(): OpsSyncCommand | null {
  const cmd = (window as any)[PENDING_KEY] as OpsSyncCommand | undefined;
  (window as any)[PENDING_KEY] = null;
  return cmd ?? null;
}

export function onOpsSyncCommand(handler: (cmd: OpsSyncCommand) => void): () => void {
  const listener = (event: Event) => {
    const detail = (event as CustomEvent).detail as OpsSyncCommand | undefined;
    if (!detail) return;
    handler(detail);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}

