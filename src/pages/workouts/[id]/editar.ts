import type { APIRoute } from 'astro';
import { parseDatetimeLocal } from '../../../lib/calendar';
import { getDb } from '../../../lib/db';
import { applyWorkoutEdit, getWorkoutSummary } from '../../../lib/repo';

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = Number(params.id);
  const back = (message: string) =>
    redirect(`/workouts/${id}?editar=1&error=${encodeURIComponent(message)}`, 303);
  try {
    const db = getDb();
    const form = await request.formData();
    const startedAt = parseDatetimeLocal(String(form.get('inicio') ?? ''));
    if (startedAt === null) return back('Fecha no válida');
    // The sets come from the database, not from the form: a tampered form cannot add or touch other sets.
    const sets = getWorkoutSummary(db, id)
      .exercises.flatMap((e) => e.sets)
      .map((s) => ({
        setId: s.id,
        reps: Number(form.get(`reps-${s.id}`)),
        weightKg: Number(form.get(`kg-${s.id}`)),
        remove: form.has(`del-${s.id}`),
      }));
    applyWorkoutEdit(db, id, { startedAt, sets });
    return redirect(`/workouts/${id}`, 303);
  } catch (error) {
    return back((error as Error).message);
  }
};
