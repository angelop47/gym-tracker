import { useRef, useState } from 'react';

type Props = {
  exerciseId: number;
  name: string;
  photoIds: number[];
  max: number;
};

const MAX_SIDE = 1280; // phone photos are 3000+ px; this keeps each one around 150–400 KB
const MAX_BYTES = 5 * 1024 * 1024;

/** Shrinks a photo before upload. GIFs are sent as they are, because redrawing them would lose the animation. */
async function prepare(file: File): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file); // also applies the photo's rotation (EXIF)
  } catch {
    throw new Error('No se pudo leer la imagen. Prueba con una foto JPG o PNG.');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen'))),
      'image/jpeg',
      0.85,
    ),
  );
}

export default function PhotoManager({ exerciseId, name, photoIds, max }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const room = max - photoIds.length;

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError('');
    try {
      for (const file of Array.from(files).slice(0, room)) {
        const blob = await prepare(file);
        if (blob.size > MAX_BYTES) throw new Error('La foto pesa más de 5 MB');
        const response = await fetch(`/api/exercises/${exerciseId}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': blob.type || 'application/octet-stream' },
          body: blob,
        });
        if (!response.ok) throw new Error((await response.json()).error ?? 'No se pudo subir la foto');
      }
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  async function remove(id: number) {
    if (!window.confirm('¿Eliminar esta foto?')) return;
    setBusy(true);
    const response = await fetch(`/api/photos/${id}`, { method: 'DELETE' });
    if (response.ok) window.location.reload();
    else {
      setError('No se pudo eliminar la foto');
      setBusy(false);
    }
  }

  return (
    <div>
      {photoIds.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: photoIds.length === 1 ? '1fr' : '1fr 1fr', gap: '0.75rem' }}>
          {photoIds.map((id, i) => (
            <div key={id} className="card" style={{ marginBottom: 0 }}>
              <img
                src={`/photos/${id}`}
                alt={`${name}, foto ${i + 1}`}
                style={{ width: '100%', aspectRatio: '3 / 2', objectFit: 'cover', borderRadius: 8 }}
              />
              <button className="danger" style={{ width: '100%', marginTop: '0.5rem' }} disabled={busy} onClick={() => remove(id)}>
                Eliminar
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">Este ejercicio todavía no tiene fotos.</p>
      )}

      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid="photo-input"
        onChange={(e) => upload(e.target.files)}
      />
      <button
        className="primary big"
        style={{ marginTop: '1rem' }}
        disabled={busy || room <= 0}
        onClick={() => input.current?.click()}
      >
        {busy ? 'Subiendo…' : room <= 0 ? `Máximo de ${max} fotos` : 'Añadir foto'}
      </button>
      <p className="muted" style={{ fontSize: '0.85rem' }}>
        Puedes subir hasta {max} fotos por ejercicio (JPG, PNG, WebP o GIF). Se reducen automáticamente y se guardan en tu base de datos.
      </p>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}
