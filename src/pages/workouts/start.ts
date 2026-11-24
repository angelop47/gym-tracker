import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db';
import { startWorkout } from '../../lib/repo';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  try {
    const id = startWorkout(getDb(), Number(form.get('routineId')), Date.now());
    return redirect(`/workouts/${id}`, 303);
  } catch (error) {
    return new Response((error as Error).message, { status: 400 });
  }
};
