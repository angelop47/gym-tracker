import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { deleteExercisePhoto } from '../../../lib/repo';

export const DELETE: APIRoute = async ({ params }) => {
  try {
    deleteExercisePhoto(getDb(), Number(params.id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
};
