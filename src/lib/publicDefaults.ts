// Public (anon) Supabase credentials.
//
// These are safe to ship in the frontend (they are the "anon/public" key).
// Some deploy targets don't inject Vite env vars at build time; we keep
// a default so the app still boots.
export const DEFAULT_SUPABASE_URL = "https://sbexeqqizazjfsbsgrbd.supabase.co";
export const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNiZXhlcXFpemF6amZzYnNncmJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NTA3ODMsImV4cCI6MjA4NTAyNjc4M30.znK_JuTtmW_kIEuYrnIthdm5HFgWlZeYHC4pLqgr00Y";

