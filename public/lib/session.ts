/**
 * The login cookie, shared by sign-in and by the proxy that renews it.
 *
 * Renewed on every page load that proves the token still works, so the
 * lifetime below is how long the app may go *unopened* before signing in is
 * needed again -- not, as it was, a fixed fortnight from the moment of login
 * that ended mid-use however often the app was opened.
 */
export const SESSION_COOKIE = 'access_token';

const DEFAULT_SESSION_DAYS = 14;

const configuredDays = Number(process.env.SESSION_DAYS);

export const SESSION_MAX_AGE_SECONDS =
    (Number.isFinite(configuredDays) && configuredDays > 0 ? configuredDays : DEFAULT_SESSION_DAYS) * 24 * 60 * 60;

export const sessionCookieOptions = {
    httpOnly: true,
    secure: false, //process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
};
