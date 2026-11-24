import type { APIRoute } from 'astro';
import { getDb } from '../../lib/db';
import { getExercisePhoto } from '../../lib/repo';

export const GET: APIRoute = ({ params }) => {
  const photo = getExercisePhoto(getDb(), Number(params.id));
  if (!photo) return new Response('Foto no encontrada', { status: 404 });
  return new Response(photo.data, {
    headers: {
      'Content-Type': photo.mime,
      'Content-Length': String(photo.data.byteLength),
      // A photo never changes and its id is never reused, so browsers can keep it for good.
      'Cache-Control': 'public, max-age=31536000, immutable',
      // Uploaded content is served from the app's own origin: it must never be interpreted as anything else.
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
};
