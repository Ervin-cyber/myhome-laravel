import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const protectedRoutes = ['/', '/dashboard'];

// Routes that should be accessible without authentication
const publicRoutes = ['/login'];

// Api routes matched exactly
const apiRoutes = ['/api/login', '/proxy/api/me', '/proxy/api/logout', '/proxy/api/temperature-latest', '/proxy/api/state', '/proxy/api/stats']

// Api routes that carry sub-paths, e.g. /proxy/api/air-conditioners/3
const apiRoutePrefixes = ['/proxy/api/air-conditioners', '/proxy/api/rooms']

const isApiRoute = (path: string) =>
  apiRoutes.includes(path) ||
  apiRoutePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (path.startsWith('/.') || path.startsWith('/_next') || path === '/favicon.ico') {
    return NextResponse.next();
  }
  const url = req.nextUrl.clone();

  // Skip public routes
  if (publicRoutes.some((path) => req.nextUrl.pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Only protect specified routes
  if (!protectedRoutes.some((path) => req.nextUrl.pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const accessToken = req.cookies.get('access_token')?.value;

  // No access token and not api request → redirect to login
  if (!accessToken && !path.startsWith('/proxy/api')) {
    url.pathname = '/login';
    return NextResponse.redirect(url);
  } else if (!accessToken) {
    const data = {
      'error': 'Unauthenticated!'
    }
    return new Response(JSON.stringify(data), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (isApiRoute(path)) {
    const realPath = path.replace('/proxy', '');
    if (req?.method == 'POST') {
      // Read the body rather than parse it. Not every POST carries one —
      // /rooms/live is a bare signal — and req.json() throws on an empty body,
      // which lands here as a 500 rather than as the request going through.
      const body = await req.text();

      const result = await fetch(`${process.env.API_BASE_URL}${realPath}`, {
        credentials: 'include',
        method: 'POST',
        headers: {
          'Referer': `${process.env.API_BASE_URL}`,
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          // Without this fetch labels a string body text/plain, and Laravel
          // will not read a JSON payload it has not been told is one.
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body } : {}),
      });
      return result;
    } else {
      const result = await fetch(`${process.env.API_BASE_URL}${realPath}`, {
        credentials: 'include',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        },
      });
      return result;
    }
  }

  // Validate access token with Laravel /me endpoint
  try {
    const meRes = await fetch(`${process.env.API_BASE_URL}/api/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      },
    });
    if (meRes?.status != 200) {
      url.pathname = '/login';
      return NextResponse.redirect(url);
    } else if (path == "" || path == "/") {
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  } catch {
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
