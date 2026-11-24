import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { addSet } from '../../../../lib/repo';

export const POST: APIRoute = async ({ params, request }) => {
  try {
    const body = await request.json();
    const set = addSet(getDb(), {
      workoutId: Number(params.id),
      exerciseId: Number(body.exerciseId),
      reps: Number(body.reps),
      weightKg: Number(body.weightKg),
      now: Date.now(),
    });
    return Response.json(set, { status: 201 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
};
