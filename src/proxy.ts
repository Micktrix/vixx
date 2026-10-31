import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

const PROTECTED = ["/kontor", "/laerer", "/ny-kode", "/vaelg-skole", "/ingen-skole"];

// Fornyer Supabase-sessionen ved hver navigation og sender ikke-indloggede til forsiden.
// Rollerne tjekkes i layouts på serveren (src/lib/auth/session.ts) og i databasen (RLS).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;

  if (!data?.claims && PROTECTED.some((p) => path === p || path.startsWith(`${p}/`))) {
    const redirect = NextResponse.redirect(new URL("/", request.url));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  // Husk hvilken del man bruger, så personer med både kontor og lærer lander samme sted næste gang.
  const part = path === "/kontor" || path.startsWith("/kontor/") ? "kontor" : path === "/laerer" || path.startsWith("/laerer/") ? "laerer" : null;
  if (data?.claims && part && request.cookies.get("vixx_part")?.value !== part) {
    response.cookies.set("vixx_part", part, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
