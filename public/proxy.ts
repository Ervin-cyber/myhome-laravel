import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const protectedRoutes = ['/', '/dashboard'];

// Routes that should be accessible without authentication
const publicRoutes = ['/login'];

// Api routes
const apiRoutes = ['/api/login', '/proxy/api/me', '/proxy/api/logout', '/proxy/api/temperature-latest', '/proxy/api/state', '/proxy/api/stats']

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

  // No access token → redirect to login
  if (!accessToken && !path.startsWith('/api')) {
    url.pathname = '/login';
    return NextResponse.redirect(url);
  } else if (!accessToken) {
    const data = {
      'error': 'Unauthenticateddd!'
    }
    return new Response(JSON.stringify(data), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (apiRoutes.some((path) => req.nextUrl.pathname == path)) {
    const realPath = req.nextUrl.pathname.replace('/proxy', '');
    if (req?.method == 'POST') {
      const body = await req.json();
      const result = await fetch(`${process.env.API_BASE_URL}${realPath}`, {
        credentials: 'include',
        method: 'POST',
        headers: {
          'Referer': 'http://192.168.1.100',
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json'
        },
        body: JSON.stringify(body)
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
  } catch (err) {
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}
