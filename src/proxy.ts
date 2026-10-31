import { NextResponse, type NextRequest } from "next/server";
import { SIGNUP_OPEN_MESSAGE, createAuthClient, isAdminClaims, isSignupDisabled } from "@/lib/admin-auth";
import { allowedOrigins, embedCsp } from "@/lib/embed-csp";

const PUBLIC_ADMIN_PATHS = new Set(["/admin/login", "/api/admin/login"]);

function deny(request: NextRequest, message: string, status = 401) {
  if (request.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ ok: false, error: message }, { status });
  const login = new URL("/admin/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/embed") {
    const response = NextResponse.next();
    const csp = embedCsp(
      await allowedOrigins(),
      process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NODE_ENV !== "production",
    );
    response.headers.set("content-security-policy", csp);
    response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
    response.headers.set("x-content-type-options", "nosniff");
    return response;
  }

  // CSRF: state-changing admin calls must come from the panel itself.
  if (pathname.startsWith("/api/") && request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    if (origin && origin !== request.nextUrl.origin)
      return NextResponse.json({ ok: false, error: "Origem não permitida." }, { status: 403 });
  }

  let response = NextResponse.next({ request });
  if (PUBLIC_ADMIN_PATHS.has(pathname)) return response;

  // Checked on every request, not only at login: re-enabling public sign-ups locks the panel.
  if (!(await isSignupDisabled())) return deny(request, SIGNUP_OPEN_MESSAGE, 403);

  let authorized = false;
  try {
    // Also refreshes the Supabase session cookies when the access token is about to expire.
    const supabase = createAuthClient({
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => {
        for (const { name, value } of cookies) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
      },
    });
    const { data } = await supabase.auth.getClaims();
    authorized = isAdminClaims(data?.claims);
  } catch {
    authorized = false;
  }
  return authorized ? response : deny(request, "Sessão expirada. Entre novamente no painel.");
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/embed"],
};
