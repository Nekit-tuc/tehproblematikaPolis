export function hasSupabaseEnv() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export const missingSupabaseMessage =
  "Supabase не підключений. Заповніть NEXT_PUBLIC_SUPABASE_URL і NEXT_PUBLIC_SUPABASE_ANON_KEY у .env.local.";
