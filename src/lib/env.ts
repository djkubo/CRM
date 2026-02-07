type EnvValue = string | undefined;

export const env = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL as EnvValue,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as EnvValue,
  VITE_SUPABASE_PROJECT_ID: import.meta.env.VITE_SUPABASE_PROJECT_ID as EnvValue,
} as const;

const REQUIRED_CLIENT_ENVS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
] as const;

export type RequiredClientEnvKey = (typeof REQUIRED_CLIENT_ENVS)[number];

export function missingSupabaseEnvKeys(): RequiredClientEnvKey[] {
  const missing: RequiredClientEnvKey[] = [];

  for (const key of REQUIRED_CLIENT_ENVS) {
    const value = env[key];
    if (!value) missing.push(key);
  }

  return missing;
}

export function isSupabaseConfigured(): boolean {
  return missingSupabaseEnvKeys().length === 0;
}

