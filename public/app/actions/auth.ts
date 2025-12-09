"use server"

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

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

            cookieStore.set('access_token', data.access_token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: 60 * 60 * 24 * 1, // 1 week
                path: '/',
            })
            redirect('/dashboard');
        } else {
            throw data?.message ?? JSON.stringify(data);
        }
    })
}

export async function signOut() {
    const cookieStore = await cookies();
    const token = cookieStore.get('access_token')?.value;
    await fetch(`${process.env.API_BASE_URL}/api/logout`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            Accept: 'application/json'
        },
    });
    cookieStore.delete('access_token');
    redirect('/login');
}