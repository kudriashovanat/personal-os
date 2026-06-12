import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

// Серверный клиент с service-role ключом. Используется ТОЛЬКО в route handlers (никогда на клиенте).
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase не настроен: задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env");
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
