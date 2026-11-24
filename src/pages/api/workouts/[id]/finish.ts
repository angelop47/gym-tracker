import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { finishWorkout } from '../../../../lib/repo';

export const POST: APIRoute = async ({ params }) => {
  try {
    finishWorkout(getDb(), Number(params.id), Date.now());
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
};
