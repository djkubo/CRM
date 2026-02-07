// Canonical app routes (full paths). Keep this as the single source of truth
// for navigation + redirects, so reorganizing IA doesn't require hunting strings.

export const APP_PATHS = {
  commandCenter: "/",

  // Insights
  analytics: "/insights/analytics",

  // CRM
  inbox: "/crm/inbox",
  clients: "/crm/clients",

  // Growth
  campaigns: "/growth/campaigns",
  broadcast: "/growth/broadcast",
  flows: "/growth/flows",

  // Channels
  whatsapp: "/channels/whatsapp",

  // Revenue
  movements: "/revenue/transactions",
  invoices: "/revenue/invoices",
  subscriptions: "/revenue/subscriptions",
  recovery: "/revenue/recovery",

  // Ops + Admin
  sync: "/ops/sync",
  diagnostics: "/ops/diagnostics",
  settings: "/admin/settings",
} as const;

// Old routes (v1) that must keep working for bookmarks and external links.
export const LEGACY_TO_CANONICAL_PATHS: Record<string, string> = {
  "/analytics": APP_PATHS.analytics,
  "/movements": APP_PATHS.movements,
  "/messages": APP_PATHS.inbox,
  "/clients": APP_PATHS.clients,
  "/campaigns": APP_PATHS.campaigns,
  "/broadcast": APP_PATHS.broadcast,
  "/flows": APP_PATHS.flows,
  "/whatsapp": APP_PATHS.whatsapp,
  "/invoices": APP_PATHS.invoices,
  "/subscriptions": APP_PATHS.subscriptions,
  "/recovery": APP_PATHS.recovery,
  "/import": APP_PATHS.sync,
  "/diagnostics": APP_PATHS.diagnostics,
  "/settings": APP_PATHS.settings,
};

