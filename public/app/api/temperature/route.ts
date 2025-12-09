import { cookies } from "next/headers";

export async function GET() {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    const res = await fetch(`${process.env.API_BASE_URL}/api/temperature-latest`, {
        headers: { 
            Authorization: `Bearer ${token}`,
            Accept: 'application/json'
        },
    });

    return Response.json(await res.json());
}