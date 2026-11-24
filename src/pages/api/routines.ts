import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db';
import { createRoutine } from '../../lib/repo';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const id = createRoutine(getDb(), String(body.name ?? ''), body.items ?? []);
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
};
