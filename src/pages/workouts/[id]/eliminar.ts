import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { deleteWorkout } from '../../../lib/repo';

export const POST: APIRoute = async ({ params, redirect }) => {
  try {
    deleteWorkout(getDb(), Number(params.id));
    return redirect('/', 303);
  } catch (error) {
    return new Response((error as Error).message, { status: 400 });
  }
};
