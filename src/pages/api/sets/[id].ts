import type { APIRoute } from 'astro';
import { getDb } from '../../../lib/db';
import { deleteSet } from '../../../lib/repo';

export const DELETE: APIRoute = async ({ params }) => {
  try {
    deleteSet(getDb(), Number(params.id));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
};
