import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Direkte adgang til den LOKALE testdatabase, til opsætning, appen endnu ikke har skærme til
// (fx en lærers ferieanmodning, som kommer i trin 6). Læser .env.local, som kun findes lokalt.
export function localAdmin() {
  const env = Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.startsWith("#"))
      .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
  );
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url?.startsWith("http://127.0.0.1")) throw new Error("E2E-tests må kun køre mod den lokale database.");
  return createClient(url, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
}
