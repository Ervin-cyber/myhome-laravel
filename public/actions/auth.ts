"use server"

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";

export async function signIn(email: string, password: string) {
    return await fetch(`${process.env.API_BASE_URL}/api/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({ email, password }),
        cache: "no-store",
    }).then(async response => {
        const data = await response.json();

        if (data?.access_token) {
            const cookieStore = await cookies()
            
            cookieStore.set(SESSION_COOKIE, data.access_token, sessionCookieOptions)
            redirect('/dashboard');
        } else {
            throw data?.message ?? JSON.stringify(data);
        }
    })
}

export async function signOut() {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    await fetch(`${process.env.API_BASE_URL}/api/logout`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            Accept: 'application/json'
        },
    });
    cookieStore.delete(SESSION_COOKIE);
    redirect('/login');
}