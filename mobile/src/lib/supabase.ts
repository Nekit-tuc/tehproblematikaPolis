import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

declare const process: {
  env: Record<string, string | undefined>;
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function normalizeSupabaseUrl(value: string) {
  return value
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/i, "")
    .replace(/\/auth\/v1$/i, "");
}

const normalizedSupabaseUrl = normalizeSupabaseUrl(supabaseUrl);
const isValidSupabaseUrl = normalizedSupabaseUrl.includes(".supabase.co");

if (__DEV__) {
  console.log("[mobile-supabase-env]", {
    supabaseUrl: normalizedSupabaseUrl,
    hasAnonKey: Boolean(supabaseAnonKey),
    endsWithRestV1: supabaseUrl.trim().replace(/\/+$/, "").endsWith("/rest/v1"),
    endsWithAuthV1: supabaseUrl.trim().replace(/\/+$/, "").endsWith("/auth/v1"),
    endsWithSlash: supabaseUrl.trim().endsWith("/"),
  });
}

export const hasMobileSupabaseEnv = Boolean(normalizedSupabaseUrl && supabaseAnonKey && isValidSupabaseUrl);
export const mobileSupabaseEnvError = hasMobileSupabaseEnv ? null : "Некоректний EXPO_PUBLIC_SUPABASE_URL у mobile/.env";

export const supabase = createClient(normalizedSupabaseUrl || "https://example.supabase.co", supabaseAnonKey || "missing", {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
