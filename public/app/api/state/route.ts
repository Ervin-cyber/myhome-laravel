import { redirect } from "next/dist/server/api-utils";
import { cookies } from "next/headers";

export async function POST(req: Request) {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    const res = await fetch(`${process.env.API_BASE_URL}/api/state`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json'
        },
        body: JSON.stringify(req.body)
    });

    return Response.json(await res.json());
}

export async function GET() {
    const cookieStore = await cookies()
    const token = cookieStore.get('access_token')?.value

    const res = await fetch(`${process.env.API_BASE_URL}/api/state`, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json'
        },
    });

    return Response.json(await res.json());
}