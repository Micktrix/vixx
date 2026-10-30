import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

// Serverens klient med fulde rettigheder (går uden om RLS). Bruges kun til det, brugerne ikke
// selv må: oprette login, sætte koder og afbryde sessioner. Kald først et rettighedstjek.
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("Mangler miljøvariablen SUPABASE_SECRET_KEY. Se .env.example.");

  return createClient(supabaseUrl(), key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
