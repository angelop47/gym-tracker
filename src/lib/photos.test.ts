import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from './db';
import { exerciseImageUrls } from './images';
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_EXERCISE, readBodyLimited, sniffImageMime } from './photos';
import {
  addExercisePhoto,
  createRoutine,
  deleteExercisePhoto,
  getExercise,
  getExercisePhoto,
  getRoutineItems,
  listExercises,
} from './repo';

const jpeg = (extra = 0) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(extra).fill(7)]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const gif = new Uint8Array([...'GIF89a'].map((c) => c.charCodeAt(0)).concat([1, 0, 1, 0]));
const webp = new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))));
const text = (s: string) => new TextEncoder().encode(s);

describe('sniffImageMime', () => {
  it('recognises JPEG, PNG, GIF and WebP by their first bytes', () => {
    expect(sniffImageMime(jpeg())).toBe('image/jpeg');
    expect(sniffImageMime(png)).toBe('image/png');
    expect(sniffImageMime(gif)).toBe('image/gif');
    expect(sniffImageMime(webp)).toBe('image/webp');
    expect(sniffImageMime(text('GIF87a....'))).toBe('image/gif');
  });

  it('refuses SVG, HTML, text, truncated and empty content', () => {
    expect(sniffImageMime(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImageMime(text('<!doctype html><script>alert(1)</script>'))).toBeNull();
    expect(sniffImageMime(text('hola'))).toBeNull();
    expect(sniffImageMime(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffImageMime(text('RIFFxxxxWAVE'))).toBeNull();
    expect(sniffImageMime(new Uint8Array())).toBeNull();
  });
});

describe('exercise photos', () => {
  let db: Db;
  let ex: number;
  let other: number;
  beforeEach(() => {
    db = openDb(':memory:');
    [ex, other] = listExercises(db).map((e) => e.id);
  });

  it('stores a photo and gives it back byte for byte, with the type decided by its content', () => {
    const bytes = jpeg(100);
    const id = addExercisePhoto(db, ex, bytes, 1000);
    const photo = getExercisePhoto(db, id)!;
    expect(photo.mime).toBe('image/jpeg');
    expect(Array.from(photo.data)).toEqual(Array.from(bytes));
    expect(getExercisePhoto(db, 99999)).toBeNull();
  });

  it('rejects non-images, oversize files, unknown exercises and more than the limit, storing nothing', () => {
    expect(() => addExercisePhoto(db, ex, text('<svg/>'), 1)).toThrow('imagen válida');
    expect(() => addExercisePhoto(db, ex, jpeg(MAX_PHOTO_BYTES), 1)).toThrow('5 MB');
    expect(() => addExercisePhoto(db, 99999, jpeg(), 1)).toThrow('Ejercicio no encontrado');
    for (let i = 0; i < MAX_PHOTOS_PER_EXERCISE; i++) addExercisePhoto(db, ex, jpeg(i), i);
    expect(() => addExercisePhoto(db, ex, jpeg(), 9)).toThrow('Máximo');
    expect(getExercise(db, ex)!.photoIds).toHaveLength(MAX_PHOTOS_PER_EXERCISE);
    expect(getExercise(db, other)!.photoIds).toEqual([]); // the limit is per exercise
    expect(addExercisePhoto(db, other, png, 10)).toBeGreaterThan(0);
  });

  it('accepts a file of exactly the maximum size', () => {
    expect(() => addExercisePhoto(db, ex, jpeg(MAX_PHOTO_BYTES - 4), 1)).not.toThrow();
  });

  it('never reuses the id of a deleted photo (they are cached forever by id)', () => {
    const first = addExercisePhoto(db, ex, jpeg(1), 1);
    deleteExercisePhoto(db, first);
    const second = addExercisePhoto(db, ex, jpeg(2), 2);
    expect(second).toBeGreaterThan(first);
    expect(getExercisePhoto(db, first)).toBeNull();
    expect(() => deleteExercisePhoto(db, first)).toThrow('Foto no encontrada');
  });

  it('lists photo ids per exercise and on routine items', () => {
    const a = addExercisePhoto(db, ex, jpeg(1), 1);
    const b = addExercisePhoto(db, ex, png, 2);
    const routine = createRoutine(db, 'R', [
      { exerciseId: ex, targetSets: 3, targetReps: 10, restSeconds: 60 },
      { exerciseId: other, targetSets: 3, targetReps: 10, restSeconds: 60 },
    ]);
    expect(listExercises(db).find((e) => e.id === ex)!.photoIds).toEqual([a, b]);
    expect(getRoutineItems(db, routine).map((i) => i.photoIds)).toEqual([[a, b], []]);
  });

  it('removes the photos together with their exercise', () => {
    const id = addExercisePhoto(db, ex, jpeg(), 1);
    db.prepare('DELETE FROM exercises WHERE id = ?').run(ex);
    expect(getExercisePhoto(db, id)).toBeNull();
  });
});

describe('exerciseImageUrls', () => {
  it('maps photo ids to their URLs, in order, and returns nothing when there are none', () => {
    expect(exerciseImageUrls({ photoIds: [3, 5] })).toEqual(['/photos/3', '/photos/5']);
    expect(exerciseImageUrls({ photoIds: [] })).toEqual([]);
    expect(exerciseImageUrls({})).toEqual([]);
  });
});

describe('readBodyLimited', () => {
  const post = (body: Uint8Array | null) => new Request('http://localhost/x', { method: 'POST', body });

  it('returns the bytes of a body within the limit, including an empty one', async () => {
    expect(Array.from((await readBodyLimited(post(new Uint8Array([1, 2, 3])), 10))!)).toEqual([1, 2, 3]);
    expect((await readBodyLimited(post(new Uint8Array([1, 2, 3, 4])), 4))!.byteLength).toBe(4); // exactly the limit
    expect((await readBodyLimited(post(null), 10))!.byteLength).toBe(0);
  });

  it('returns null as soon as the body is larger than the limit', async () => {
    expect(await readBodyLimited(post(new Uint8Array(5)), 4)).toBeNull();
    // Many small chunks that add up past the limit.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 10; i++) controller.enqueue(new Uint8Array(3));
        controller.close();
      },
    });
    const chunked = new Request('http://localhost/x', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    expect(await readBodyLimited(chunked, 20)).toBeNull();
  });
});
