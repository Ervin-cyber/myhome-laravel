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

    // Only a refusal means the session is over. Anything else — 502 while the
    // API container is still coming up, 504 behind a proxy that has not
    // re-resolved it yet — says the API is unavailable, which is not the same
    // as the token being bad and must not cost a valid two-week session. This
    // is why every deploy appeared to log you out: for the few seconds Laravel
    // was down, every page load was read as a rejected token.
    if (meRes.status === 401 || meRes.status === 403) {
      url.pathname = '/login';
      const response = NextResponse.redirect(url);
      response.cookies.delete('access_token');
      return response;
    }

    if (!meRes.ok) {
      // Render the page and let it retry. Its own polling recovers on its own
      // once the API answers again, with the session still in hand.
      return NextResponse.next();
    }

    if (path == "" || path == "/") {
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  } catch {
    // Could not reach the API at all. Same reasoning: unreachable is not
    // unauthenticated, and bouncing to login would throw the session away over
    // a container that is thirty seconds from being back.
    return NextResponse.next();
  }

  return NextResponse.next();
}
