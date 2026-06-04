import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  
  // Define workspace dashboard routes that require authentication
  const protectedPaths = ["/inbox", "/contacts", "/knowledge-base", "/settings"];
  const isProtected = protectedPaths.some(p => path === p || path.startsWith(p + "/"));

  if (isProtected) {
    // Check for Supabase session cookies (names usually start with "sb-")
    const cookies = request.cookies.getAll();
    const hasSession = cookies.some(cookie => 
      cookie.name.startsWith("sb-") || cookie.name.includes("auth-token")
    );

    if (!hasSession) {
      // Redirect unauthenticated clients to login page
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  return NextResponse.next();
}

// Map matcher paths to run middleware only on page requests
export const config = {
  matcher: [
    "/inbox/:path*",
    "/contacts/:path*",
    "/knowledge-base/:path*",
    "/settings/:path*",
  ],
};
