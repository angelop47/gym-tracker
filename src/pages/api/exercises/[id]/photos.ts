import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db';
import { MAX_PHOTO_BYTES, readBodyLimited } from '../../../../lib/photos';
import { addExercisePhoto } from '../../../../lib/repo';

/** The body is the raw image file. The content type is not trusted: the bytes decide what it is. */
export const POST: APIRoute = async ({ params, request }) => {
  try {
    const data = await readBodyLimited(request, MAX_PHOTO_BYTES);
    if (data === null) return Response.json({ error: 'La foto pesa más de 5 MB' }, { status: 413 });
    const id = addExercisePhoto(getDb(), Number(params.id), data, Date.now());
    return Response.json({ id }, { status: 201 });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 400 });
  }
};
