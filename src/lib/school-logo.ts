import { supabaseUrl } from "@/lib/supabase/env";

// Skolens logo ligger i den offentlige Storage-bucket "school-logos" (højst 1 MB, PNG/JPEG/WebP).
export const LOGO_BUCKET = "school-logos";
export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export function schoolLogoUrl(path: string | null | undefined): string | null {
  return path ? `${supabaseUrl()}/storage/v1/object/public/${LOGO_BUCKET}/${path}` : null;
}
