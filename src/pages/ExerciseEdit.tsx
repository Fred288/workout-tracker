import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/dexie';
import type { Equipment, Exercise, ExerciseType } from '../db/types';
import { EQUIPMENT_LABELS, TYPE_LABELS } from '../lib/labels';
import { MUSCLES_BY_LABEL, MUSCLE_LABELS, type MuscleId } from '../lib/muscleMap';
import { exerciseImageUrl, fileToDataUrl } from '../lib/images';
import { newId } from '../lib/id';

const field = 'min-h-11 w-full rounded-lg border border-border bg-surface px-3';
const label = 'mb-1 block text-sm text-neutral-400';

function MusclePicker({
  value,
  onToggle,
  disabled,
}: {
  value: string[];
  onToggle: (m: MuscleId) => void;
  disabled?: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {MUSCLES_BY_LABEL.map((m) => {
        const on = value.includes(m);
        const off = disabled?.includes(m);
        return (
          <button
            key={m}
            type="button"
            disabled={off}
            aria-pressed={on}
            onClick={() => onToggle(m)}
            className={`min-h-9 rounded-full border px-3 text-sm ${
              on ? 'border-accent bg-accent/20 text-accent' : 'border-border text-neutral-300'
            } ${off ? 'opacity-30' : ''}`}
          >
            {MUSCLE_LABELS[m]}
          </button>
        );
      })}
    </div>
  );
}

export default function ExerciseEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState('');
  const [equipment, setEquipment] = useState<Equipment>('none');
  const [type, setType] = useState<ExerciseType>('bodyweight_reps');
  const [primary, setPrimary] = useState<string[]>([]);
  const [secondary, setSecondary] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');
  const [image, setImage] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    void db.exercises.get(id).then((e) => {
      if (!e || !e.isCustom) {
        navigate('/exercises', { replace: true });
        return;
      }
      setName(e.name);
      setEquipment(e.equipment);
      setType(e.type);
      setPrimary(e.primaryMuscles);
      setSecondary(e.secondaryMuscles);
      setInstructions(e.instructions.join('\n'));
      setImage(e.images[0]);
      setLoaded(true);
    });
  }, [id, navigate]);

  const toggle = (list: string[], set: (v: string[]) => void, m: string) =>
    set(list.includes(m) ? list.filter((x) => x !== m) : [...list, m]);

  async function onImage(file: File) {
    try {
      setImage(await fileToDataUrl(file));
    } catch {
      setError('Bild konnte nicht geladen werden.');
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return setError('Bitte einen Namen eingeben.');
    if (!primary.length) return setError('Bitte mindestens einen primären Muskel wählen.');
    const exercise: Exercise = {
      id: id ?? newId(),
      name: trimmed,
      equipment,
      type,
      primaryMuscles: primary,
      secondaryMuscles: secondary.filter((m) => !primary.includes(m)),
      instructions: instructions
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      images: image ? [image] : [],
      isCustom: true,
    };
    await db.exercises.put(exercise);
    navigate(`/exercises/${encodeURIComponent(exercise.id)}`, { replace: true });
  }

  if (!loaded) return null;

  return (
    <form onSubmit={(e) => void onSave(e)} className="space-y-5 pb-8">
      <div className="flex items-center justify-between pt-3">
        <button type="button" onClick={() => navigate(-1)} className="min-h-11 text-sm text-accent">
          Abbrechen
        </button>
        <button type="submit" className="min-h-11 font-semibold text-accent">
          Speichern
        </button>
      </div>
      <h1 className="text-2xl font-bold">{id ? 'Übung bearbeiten' : 'Neue Übung'}</h1>

      <div>
        <label className={label} htmlFor="ex-name">
          Name
        </label>
        <input id="ex-name" className={field} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className={label} htmlFor="ex-eq">
            Ausrüstung
          </label>
          <select
            id="ex-eq"
            className={field}
            value={equipment}
            onChange={(e) => setEquipment(e.target.value as Equipment)}
          >
            {Object.entries(EQUIPMENT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className={label} htmlFor="ex-type">
            Typ
          </label>
          <select
            id="ex-type"
            className={field}
            value={type}
            onChange={(e) => setType(e.target.value as ExerciseType)}
          >
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <span className={label}>Primäre Muskeln</span>
        <MusclePicker value={primary} onToggle={(m) => toggle(primary, setPrimary, m)} />
      </div>
      <div>
        <span className={label}>Sekundäre Muskeln</span>
        <MusclePicker
          value={secondary}
          disabled={primary}
          onToggle={(m) => toggle(secondary, setSecondary, m)}
        />
      </div>

      <div>
        <label className={label} htmlFor="ex-instr">
          Anleitung (ein Schritt pro Zeile)
        </label>
        <textarea
          id="ex-instr"
          rows={5}
          className={`${field} py-2`}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </div>

      <div>
        <span className={label}>Bild</span>
        {image && (
          <img src={exerciseImageUrl(image)} alt="" className="mb-2 max-h-48 rounded-lg bg-white" />
        )}
        <div className="flex gap-4">
          <button type="button" className="min-h-11 text-sm text-accent" onClick={() => fileRef.current?.click()}>
            {image ? 'Bild ändern' : 'Bild hinzufügen'}
          </button>
          {image && (
            <button type="button" className="min-h-11 text-sm text-red-400" onClick={() => setImage(undefined)}>
              Entfernen
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void onImage(f);
          }}
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
