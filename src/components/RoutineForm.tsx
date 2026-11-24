import { useState } from 'react';

type Exercise = { id: number; name: string; equipment: string; muscleGroup: string };
type Row = {
  exerciseId: number;
  targetSets: number;
  targetReps: number;
  restSeconds: number;
  repsLabel: string;
  note: string;
};
type Initial = {
  id: number;
  name: string;
  items: {
    exerciseId: number;
    targetSets: number;
    targetReps: number;
    restSeconds: number;
    repsLabel?: string | null;
    note?: string | null;
  }[];
};

export default function RoutineForm({ exercises, initial }: { exercises: Exercise[]; initial?: Initial }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [rows, setRows] = useState<Row[]>(
    initial
      ? initial.items.map((it) => ({ ...it, repsLabel: it.repsLabel ?? '', note: it.note ?? '' }))
      : [newRow(exercises)],
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const move = (index: number, delta: number) =>
    setRows((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  async function save() {
    setBusy(true);
    setError('');
    const response = await fetch(initial ? `/api/routines/${initial.id}` : '/api/routines', {
      method: initial ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, items: rows }),
    });
    if (response.ok) {
      window.location.href = '/routines';
      return;
    }
    setError((await response.json()).error ?? 'No se pudo guardar la rutina');
    setBusy(false);
  }

  return (
    <div>
      <div className="card">
        <label htmlFor="routine-name">Nombre de la rutina</label>
        <input
          id="routine-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Día de empuje"
        />
      </div>

      {rows.map((row, i) => (
        <div className="card" key={i}>
          <label>Ejercicio {i + 1}</label>
          <select
            value={row.exerciseId}
            onChange={(e) => update(i, { exerciseId: Number(e.target.value) })}
          >
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} ({e.equipment})
              </option>
            ))}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginTop: '0.75rem' }}>
            <div>
              <label>Series</label>
              <input type="number" inputMode="numeric" min={1} value={row.targetSets}
                onChange={(e) => update(i, { targetSets: Number(e.target.value) })} />
            </div>
            <div>
              <label>Reps</label>
              <input type="number" inputMode="numeric" min={1} value={row.targetReps}
                onChange={(e) => update(i, { targetReps: Number(e.target.value) })} />
            </div>
            <div>
              <label>Descanso (s)</label>
              <input type="number" inputMode="numeric" min={0} step={15} value={row.restSeconds}
                onChange={(e) => update(i, { restSeconds: Number(e.target.value) })} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.5rem', marginTop: '0.75rem' }}>
            <div>
              <label>Rango (opcional)</label>
              <input value={row.repsLabel} placeholder="6–8" onChange={(e) => update(i, { repsLabel: e.target.value })} />
            </div>
            <div>
              <label>Nota (opcional)</label>
              <input value={row.note} placeholder="por brazo" onChange={(e) => update(i, { note: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button aria-label="Subir ejercicio" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button aria-label="Bajar ejercicio" disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓</button>
            {rows.length > 1 && (
              <button className="danger" onClick={() => setRows((current) => current.filter((_, j) => j !== i))}>
                Quitar
              </button>
            )}
          </div>
        </div>
      ))}

      <button className="big" onClick={() => setRows((current) => [...current, newRow(exercises)])}>
        + Añadir ejercicio
      </button>
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      <div style={{ marginTop: '0.75rem' }}>
        <button className="primary big" disabled={busy} onClick={save}>
          {initial ? 'Guardar cambios' : 'Guardar rutina'}
        </button>
      </div>
    </div>
  );
}

function newRow(exercises: Exercise[]): Row {
  return { exerciseId: exercises[0]?.id ?? 0, targetSets: 3, targetReps: 10, restSeconds: 90, repsLabel: '', note: '' };
}
