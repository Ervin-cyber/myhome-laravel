import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from './lib/session';

// Routes that require authentication
const protectedRoutes = ['/', '/dashboard', '/settings'];

// Routes that should be accessible without authentication
const publicRoutes = ['/login'];

// Api routes matched exactly
const apiRoutes = ['/api/login', '/proxy/api/me', '/proxy/api/logout', '/proxy/api/temperature-latest', '/proxy/api/state', '/proxy/api/stats']

// Api routes that carry sub-paths, e.g. /proxy/api/air-conditioners/3
const apiRoutePrefixes = ['/proxy/api/air-conditioners', '/proxy/api/rooms', '/proxy/api/admin']

const isApiRoute = (path: string) =>
  apiRoutes.includes(path) ||
  apiRoutePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

type TokenCheck = 'valid' | 'invalid' | 'unknown';

/**
 * Ask the API whether a token still works.
 *
 * Three answers, not two. Only a refusal (401/403) means the session is over.
 * A 502 while the API container is coming up, a 504 behind a proxy that has
 * not re-resolved it, or no answer at all, says the API is unavailable -- not
 * that the token is bad -- and must not cost a valid session. That confusion is
 * why every deploy used to appear to log everybody out.
 */
async function checkToken(token: string): Promise<TokenCheck> {
  try {
    const res = await fetch(`${process.env.API_BASE_URL}/api/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
    });

    if (res.status === 401 || res.status === 403) return 'invalid';

    return res.ok ? 'valid' : 'unknown';
  } catch {
    return 'unknown';
  }
}

/** Start the session's lifetime over, on a response that has proved the token. */
function renew(response: NextResponse, token: string): NextResponse {
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);

  return response;
}

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  if (path.startsWith('/.') || path.startsWith('/_next') || path === '/favicon.ico') {
    return NextResponse.next();
  }
  const url = req.nextUrl.clone();

  if (publicRoutes.some((path) => req.nextUrl.pathname.startsWith(path))) {
    const token = req.cookies.get(SESSION_COOKIE)?.value;

    // Somebody still signed in who lands on the login page -- sent there by a
    // 401 during a blip, or by an old bookmark -- goes back to the dashboard
    // instead of being asked for a password they do not need. Only on a
    // confirmed token: with the API down, showing the form is the safe answer,
    // and redirecting would loop between here and a dashboard that cannot load.
    if (token && path.startsWith('/login') && await checkToken(token) === 'valid') {
      url.pathname = '/dashboard';

      return renew(NextResponse.redirect(url), token);
    }

    return NextResponse.next();
  }

  // Only protect specified routes
  if (!protectedRoutes.some((path) => req.nextUrl.pathname.startsWith(path))) {
    return NextResponse.next();
  }

  const accessToken = req.cookies.get(SESSION_COOKIE)?.value;

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
    // With the query string: pathname alone dropped it, so ?range=7d reached
    // the API as a bare /stats and quietly answered for the default.
    const realPath = path.replace('/proxy', '') + req.nextUrl.search;
    // Anything but GET carries its method through. This used to be POST-or-GET,
    // which quietly turned a DELETE into a GET of the same path.
    if (req?.method !== 'GET' && req?.method !== 'HEAD') {
      // Read the body rather than parse it. Not every POST carries one —
      // /rooms/live is a bare signal — and req.json() throws on an empty body,
      // which lands here as a 500 rather than as the request going through.
      const body = await req.text();

      const result = await fetch(`${process.env.API_BASE_URL}${realPath}`, {
        credentials: 'include',
        method: req.method,
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

  const check = await checkToken(accessToken);

  if (check === 'invalid') {
    url.pathname = '/login';
    const response = NextResponse.redirect(url);
    response.cookies.delete(SESSION_COOKIE);
    return response;
  }

  if (check === 'unknown') {
    // Render the page and let it retry. Its own polling recovers once the API
    // answers again, with the session still in hand.
    return NextResponse.next();
  }

  // The API has just vouched for the token, so the session starts its
  // lifetime over. Only on a page load: an API call carries no such proof, and
  // renewing during an outage would keep a cookie alive for a token nobody has
  // checked.
  if (path == "" || path == "/") {
    url.pathname = '/dashboard';
    return renew(NextResponse.redirect(url), accessToken);
  }

  return renew(NextResponse.next(), accessToken);
}
