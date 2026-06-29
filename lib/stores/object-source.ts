import { storeAddresses } from "@/lib/data/store-addresses";
import type { StoreObjectRecord } from "@/lib/stores/match-store";
import type { CompanyObject } from "@/types/domain";

export type MatcherObjectSource = {
  records: StoreObjectRecord[];
  source: "supabase_objects" | "static_store_addresses";
  count: number;
  error: string | null;
};

export async function loadMatcherObjectsFromSupabase(supabase: { from: (table: string) => any }): Promise<MatcherObjectSource> {
  const { data, error } = await supabase.from("objects").select("*").eq("is_active", true);
  if (error) {
    return { records: storeAddresses, source: "static_store_addresses", count: storeAddresses.length, error: error.message ?? "Failed to load objects" };
  }

  const objects = (data ?? []) as CompanyObject[];
  if (objects.length === 0) {
    return { records: storeAddresses, source: "static_store_addresses", count: storeAddresses.length, error: "No active Supabase objects found" };
  }

  return { records: objects, source: "supabase_objects", count: objects.length, error: null };
}
