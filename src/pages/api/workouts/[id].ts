import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { deleteWorkout } from '../../../lib/repo';

export const DELETE: APIRoute = async ({ params }) => {
  try {
    deleteWorkout(getDb(), Number(params.id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
};
