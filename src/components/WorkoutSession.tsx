import { useEffect, useRef, useState } from 'react';
import { exerciseImageUrls } from '../lib/images';
import { formatClock, restRemainingMs } from '../lib/rest';

type LoggedSet = { id: number; reps: number; weightKg: number; completedAt: number };
type Item = {
  exerciseId: number;
  name: string;
  equipment: string;
  photoIds: number[];
  targetSets: number;
  targetReps: number;
  restSeconds: number;
  repsLabel: string | null;
  note: string | null;
  sets: LoggedSet[];
  last: { reps: number; weightKg: number } | null;
};
type Props = { workoutId: number; routineName: string; startedAt: number; items: Item[] };

/** Pre-fill from this session's previous set, else last session, else the routine target. */
function defaultsFor(item: Item): { reps: number; weightKg: number } {
  const previous = item.sets[item.sets.length - 1] ?? item.last;
  return { reps: previous?.reps ?? item.targetReps, weightKg: previous?.weightKg ?? 0 };
}

export default function WorkoutSession({ workoutId, routineName, startedAt, items: initial }: Props) {
  const [items, setItems] = useState<Item[]>(initial);
  const [index, setIndex] = useState(() => {
    const open = initial.findIndex((item) => item.sets.length < item.targetSets);
    return open === -1 ? 0 : open;
  });
  const [reps, setReps] = useState(() => defaultsFor(items[index]).reps);
  const [weight, setWeight] = useState(() => defaultsFor(items[index]).weightKg);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const audio = useRef<AudioContext | null>(null);
  const wasResting = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);

  // The most recent set anywhere in the workout decides the running rest.
  let latest: { at: number; rest: number } | null = null;
  for (const item of items) {
    for (const set of item.sets) {
      if (!latest || set.completedAt > latest.at) latest = { at: set.completedAt, rest: item.restSeconds };
    }
  }
  const remaining = latest ? restRemainingMs(latest.at, latest.rest, now) : 0;
  const resting = remaining > 0;

  useEffect(() => {
    if (wasResting.current && !resting) {
      navigator.vibrate?.([200, 100, 200]);
      if (audio.current) beep(audio.current);
    }
    wasResting.current = resting;
  }, [resting]);

  const item = items[index];
  const images = item ? exerciseImageUrls(item) : [];
  const totalTarget = items.reduce((sum, i) => sum + i.targetSets, 0);
  const totalDone = items.reduce((sum, i) => sum + i.sets.length, 0);
  const allDone = totalDone >= totalTarget;

  function select(next: number) {
    setIndex(next);
    const d = defaultsFor(items[next]);
    setReps(d.reps);
    setWeight(d.weightKg);
  }

  async function logSet() {
    // Created inside the click so the browser allows sound when the rest ends.
    audio.current ??= new AudioContext();
    void audio.current.resume();
    setBusy(true);
    setError('');
    const response = await fetch(`/api/workouts/${workoutId}/sets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exerciseId: item.exerciseId, reps, weightKg: weight }),
    });
    setBusy(false);
    if (!response.ok) {
      setError((await response.json()).error ?? 'No se pudo guardar la serie');
      return;
    }
    const saved = await response.json();
    const updated = items.map((it, i) =>
      i === index
        ? { ...it, sets: [...it.sets, { id: saved.id, reps: saved.reps, weightKg: saved.weightKg, completedAt: saved.completedAt }] }
        : it,
    );
    setItems(updated);
    setNow(Date.now());
    // Move on automatically once this exercise has all its sets.
    if (updated[index].sets.length >= updated[index].targetSets && index < updated.length - 1) {
      select(index + 1);
    }
  }

  async function undoLast() {
    let target: { itemIndex: number; set: LoggedSet } | null = null;
    items.forEach((it, itemIndex) =>
      it.sets.forEach((set) => {
        if (!target || set.completedAt > target.set.completedAt) target = { itemIndex, set };
      }),
    );
    if (!target) return;
    const { itemIndex, set } = target as { itemIndex: number; set: LoggedSet };
    const response = await fetch(`/api/sets/${set.id}`, { method: 'DELETE' });
    if (!response.ok) {
      setError('No se pudo deshacer la serie');
      return;
    }
    setItems((current) =>
      current.map((it, i) => (i === itemIndex ? { ...it, sets: it.sets.filter((s) => s.id !== set.id) } : it)),
    );
    select(itemIndex);
  }

  async function finish() {
    const pending = totalTarget - totalDone;
    if (pending > 0 && !window.confirm(`Faltan ${pending} series planificadas. ¿Terminar de todos modos?`)) return;
    const response = await fetch(`/api/workouts/${workoutId}/finish`, { method: 'POST' });
    if (response.ok) window.location.href = `/workouts/${workoutId}`;
    else setError('No se pudo terminar el entrenamiento');
  }

  async function cancelWorkout() {
    const message = '¿Eliminar este entrenamiento en curso y todas sus series? No se puede deshacer.';
    if (!window.confirm(message)) return;
    const response = await fetch(`/api/workouts/${workoutId}`, { method: 'DELETE' });
    if (response.ok) window.location.href = '/';
    else setError('No se pudo eliminar el entrenamiento');
  }

  if (!item) {
    return <p className="muted">Esta rutina no tiene ejercicios.</p>;
  }

  return (
    <div>
      <div className="row muted">
        <span>{routineName}</span>
        <span>⏱ {formatClock(now - startedAt)}</span>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', margin: '0.75rem 0' }}>
        {items.map((it, i) => (
          <button
            key={it.exerciseId}
            className={i === index ? 'primary' : ''}
            style={{ whiteSpace: 'nowrap', padding: '0.4rem 0.7rem' }}
            onClick={() => select(i)}
          >
            {it.sets.length}/{it.targetSets} {it.name}
          </button>
        ))}
      </div>

      {resting && latest && (
        <div className="card" style={{ textAlign: 'center', borderColor: 'var(--accent)' }}>
          <div className="muted">Descanso</div>
          <div style={{ fontSize: '3.5rem', fontWeight: 800 }}>{formatClock(remaining)}</div>
          <div className="muted">de {latest.rest}s</div>
        </div>
      )}

      <div className="card">
        {images.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: images.length === 1 ? '1fr' : '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {images.map((src, n) => (
              <img
                key={src}
                src={src}
                alt={`${item.name}, foto ${n + 1}`}
                style={{ width: '100%', aspectRatio: '3 / 2', objectFit: 'cover', borderRadius: 8 }}
              />
            ))}
          </div>
        )}
        <h1 style={{ margin: 0 }}>{item.name}</h1>
        <div className="muted">
          {item.equipment} · objetivo {item.targetSets} × {item.repsLabel ?? item.targetReps}
          {item.note && ` · ${item.note}`}
          {item.last && ` · última vez ${item.last.reps} × ${item.last.weightKg} kg`}
        </div>
        <a href={`/ejercicios/${item.exerciseId}`} className="muted" style={{ fontSize: '0.85rem' }}>
          {images.length > 0 ? 'Cambiar fotos' : 'Añadir foto'}
        </a>
        <ul className="plain" style={{ margin: '0.75rem 0' }}>
          {item.sets.map((set, i) => (
            <li key={set.id} className="muted">
              Serie {i + 1}: {set.reps} × {set.weightKg} kg ✓
            </li>
          ))}
        </ul>

        <Stepper label="Peso (kg)" value={weight} step={2.5} min={0} onChange={setWeight} />
        <Stepper label="Reps" value={reps} step={1} min={1} onChange={setReps} />

        <button className="primary big" disabled={busy || reps < 1 || weight < 0} onClick={logSet}>
          {resting ? 'Registrar serie (descansando)' : `Registrar serie ${item.sets.length + 1}`}
        </button>
      </div>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}

      <div className="row" style={{ marginTop: '0.75rem' }}>
        <button onClick={undoLast} disabled={totalDone === 0}>Deshacer última serie</button>
        <button className={allDone ? 'primary' : ''} onClick={finish}>Terminar entrenamiento</button>
      </div>
      <button className="danger" style={{ width: '100%', marginTop: '0.75rem' }} onClick={cancelWorkout}>
        Eliminar entrenamiento
      </button>
    </div>
  );
}

function Stepper(props: {
  label: string;
  value: number;
  step: number;
  min: number;
  onChange: (value: number) => void;
}) {
  const { label, value, step, min, onChange } = props;
  const clamp = (n: number) => Math.max(min, Math.round(n * 100) / 100);
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <label>{label}</label>
      <div style={{ display: 'grid', gridTemplateColumns: '3.5rem 1fr 3.5rem', gap: '0.5rem' }}>
        <button onClick={() => onChange(clamp(value - step))}>−</button>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          style={{ textAlign: 'center', fontSize: '1.3rem' }}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <button onClick={() => onChange(clamp(value + step))}>+</button>
      </div>
    </div>
  );
}

function beep(ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 880;
  gain.gain.value = 0.2;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + 0.4);
}
