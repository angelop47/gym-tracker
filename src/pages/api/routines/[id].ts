import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { updateRoutine } from '../../../lib/repo';

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const body = await request.json();
    updateRoutine(getDb(), Number(params.id), String(body.name ?? ''), body.items ?? []);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
};
