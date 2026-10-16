/**
 * The message to show for a failed request.
 *
 * Validation failures (422) carry sentences written for people -- "The email
 * has already been taken", "The house needs at least one admin" -- and hiding
 * them would leave somebody guessing why a form did nothing. Anything else is
 * a server's internals and stays in the console.
 */
export async function failureMessage(res: Response, fallback: string): Promise<string> {
    if (res.status === 403) return 'Only an admin can do that.';
    if (res.status !== 422) return fallback;

    try {
        const body = await res.json();
        const first = Object.values(body?.errors ?? {}).flat()[0];

        return typeof first === 'string' ? first : fallback;
    } catch {
        return fallback;
    }
}
