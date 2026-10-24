import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Exercise, ExerciseType, SetType, WorkoutExercise, WorkoutSet } from '../db/types';
import { displayName } from '../lib/exercises';
import { formatClock, formatSet, parseClock } from '../lib/format';
import { formatNumber, kgToUnit, parseNumber, unitToKg, type WeightUnit } from '../lib/units';

type FieldKind = 'weight' | 'reps' | 'duration' | 'distance';
interface Column {
  kind: FieldKind;
  label: string;
}

function columnsFor(type: ExerciseType, unit: WeightUnit): Column[] {
  switch (type) {
    case 'weight_reps':
      return [{ kind: 'weight', label: unit }, { kind: 'reps', label: 'Wdh.' }];
    case 'bodyweight_reps':
      return [{ kind: 'weight', label: `+${unit}` }, { kind: 'reps', label: 'Wdh.' }];
    case 'assisted_bodyweight':
      return [{ kind: 'weight', label: `−${unit}` }, { kind: 'reps', label: 'Wdh.' }];
    case 'duration':
      return [{ kind: 'duration', label: 'Zeit' }];
    case 'distance_duration':
      return [{ kind: 'distance', label: 'km' }, { kind: 'duration', label: 'Zeit' }];
  }
}

/** Display value of a set field (weights converted to the user's unit). */
function fieldText(s: WorkoutSet | undefined, kind: FieldKind, unit: WeightUnit): string {
  if (!s) return '';
  switch (kind) {
    case 'weight':
      return s.weightKg !== undefined ? formatNumber(kgToUnit(s.weightKg, unit)) : '';
    case 'reps':
      return s.reps !== undefined ? String(s.reps) : '';
    case 'duration':
      return s.durationSec !== undefined ? formatClock(s.durationSec) : '';
    case 'distance':
      return s.distanceM !== undefined ? formatNumber(s.distanceM / 1000) : '';
  }
}

/** Parses field text into a set patch; returns null for invalid (still typing) input. */
function parseField(text: string, kind: FieldKind, unit: WeightUnit): Partial<WorkoutSet> | null {
  const empty = !text.trim();
  switch (kind) {
    case 'weight': {
      const n = parseNumber(text);
      return empty ? { weightKg: undefined } : n === undefined ? null : { weightKg: unitToKg(n, unit) };
    }
    case 'reps': {
      const n = parseNumber(text);
      return empty ? { reps: undefined } : n === undefined || !Number.isInteger(n) ? null : { reps: n };
    }
    case 'duration': {
      const n = parseClock(text);
      return empty ? { durationSec: undefined } : n === undefined ? null : { durationSec: n };
    }
    case 'distance': {
      const n = parseNumber(text);
      return empty ? { distanceM: undefined } : n === undefined ? null : { distanceM: Math.round(n * 1000) };
    }
  }
}

/** Text input that keeps what the user types and only syncs from the store when not focused. */
function SetField({
  value,
  placeholder,
  kind,
  label,
  done,
  onChange,
}: {
  value: string;
  placeholder: string;
  kind: FieldKind;
  label: string;
  done: boolean;
  onChange: (text: string) => void;
}) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  return (
    <input
      aria-label={label}
      inputMode={kind === 'reps' ? 'numeric' : kind === 'duration' ? 'text' : 'decimal'}
      enterKeyHint="next"
      value={text}
      placeholder={placeholder}
      onFocus={(e) => {
        focused.current = true;
        e.target.select();
      }}
      onBlur={() => {
        focused.current = false;
        setText(value);
      }}
      onChange={(e) => {
        setText(e.target.value);
        onChange(e.target.value);
      }}
      className={`h-10 w-full min-w-0 rounded-md text-center text-base tabular-nums placeholder:text-neutral-600 ${
        done ? 'bg-transparent' : 'bg-border'
      }`}
    />
  );
}

const SET_TYPES: { type: SetType; label: string; short: string; cls: string }[] = [
  { type: 'normal', label: 'Normal', short: '', cls: '' },
  { type: 'warmup', label: 'Aufwärmen', short: 'A', cls: 'text-amber-400' },
  { type: 'drop', label: 'Dropsatz', short: 'D', cls: 'text-fuchsia-400' },
  { type: 'failure', label: 'Bis zum Versagen', short: 'V', cls: 'text-red-400' },
];


export default function WorkoutExerciseCard({
  item,
  exercise,
  previous,
  unit,
  isFirst,
  isLast,
  onSetChange,
  onToggleSet,
  onSetType,
  onRemoveSet,
  onAddSet,
  onUpdate,
  onMove,
  onRemove,
  hideCheck = false,
}: {
  /** Editing a finished workout: every set counts as done, so the check column is hidden. */
  hideCheck?: boolean;
  item: WorkoutExercise;
  exercise: Exercise | undefined;
  previous: WorkoutSet[];
  unit: WeightUnit;
  isFirst: boolean;
  isLast: boolean;
  onSetChange: (setId: string, patch: Partial<WorkoutSet>) => void;
  onToggleSet: (set: WorkoutSet, previous: WorkoutSet | undefined) => void;
  onSetType: (setId: string, type: SetType) => void;
  onRemoveSet: (setId: string) => void;
  onAddSet: () => void;
  onUpdate: (patch: { note?: string }) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [openSet, setOpenSet] = useState<string | null>(null);
  const type = exercise?.type ?? 'weight_reps';
  const cols = columnsFor(type, unit);
  const gridCols = hideCheck
    ? cols.length === 2
      ? 'grid-cols-[2.25rem_1fr_4.5rem_4.5rem]'
      : 'grid-cols-[2.25rem_1fr_9.25rem]'
    : cols.length === 2
      ? 'grid-cols-[2.25rem_1fr_4.5rem_4.5rem_2.75rem]'
      : 'grid-cols-[2.25rem_1fr_9.25rem_2.75rem]';
  let workingIndex = 0;

  return (
    <section className="rounded-xl border border-border bg-surface p-3">
      <div className="flex items-start gap-2">
        {exercise ? (
          <Link to={`/exercises/${encodeURIComponent(exercise.id)}`} className="min-w-0 flex-1 py-2 font-semibold text-accent">
            {displayName(exercise)}
          </Link>
        ) : (
          <span className="flex-1 py-2 font-semibold text-neutral-500">Unbekannte Übung</span>
        )}
        <button
          aria-label="Übungsoptionen"
          aria-expanded={menuOpen}
          className="min-h-11 min-w-11 rounded-lg text-xl text-neutral-400"
          onClick={() => setMenuOpen((o) => !o)}
        >
          ⋯
        </button>
      </div>

      {menuOpen && (
        <div className="mb-3 rounded-lg bg-border/50 p-2 text-sm">
          <div className="flex flex-wrap gap-2">
            {item.note === undefined && (
              <button className="min-h-10 rounded-md bg-surface px-3" onClick={() => onUpdate({ note: '' })}>
                Notiz hinzufügen
              </button>
            )}
            <button className="min-h-10 rounded-md bg-surface px-3 disabled:opacity-40" disabled={isFirst} onClick={() => onMove(-1)}>
              ↑ Nach oben
            </button>
            <button className="min-h-10 rounded-md bg-surface px-3 disabled:opacity-40" disabled={isLast} onClick={() => onMove(1)}>
              ↓ Nach unten
            </button>
            <button
              className="min-h-10 rounded-md bg-surface px-3 text-red-400"
              onClick={() => {
                if (confirm('Übung mit allen Sätzen entfernen?')) onRemove();
              }}
            >
              Übung entfernen
            </button>
          </div>
        </div>
      )}

      {item.note !== undefined && (
        <textarea
          aria-label="Notiz zur Übung"
          placeholder="Notiz zur Übung"
          rows={2}
          defaultValue={item.note}
          onChange={(e) => onUpdate({ note: e.target.value })}
          className="mb-2 w-full rounded-md bg-border px-3 py-2 text-base"
        />
      )}

      <div className={`grid ${gridCols} items-center gap-2 px-1 pb-1 text-xs text-neutral-500`}>
        <span className="text-center">Satz</span>
        <span>Vorher</span>
        {cols.map((c) => (
          <span key={c.kind} className="text-center">
            {c.label}
          </span>
        ))}
        {!hideCheck && <span className="text-center">✓</span>}
      </div>

      {item.sets.map((s, i) => {
        const prev = previous[i];
        const meta = SET_TYPES.find((t) => t.type === s.type)!;
        if (s.type !== 'warmup') workingIndex++;
        return (
          <div key={s.id}>
            <div
              className={`grid ${gridCols} items-center gap-2 rounded-md px-1 py-1 ${
                s.completed && !hideCheck ? 'bg-accent/15' : ''
              }`}
            >
              <button
                aria-label={`Satz ${i + 1}: ${meta.label}. Satztyp ändern`}
                className={`h-10 rounded-md text-sm font-semibold ${meta.cls || 'text-neutral-300'} ${
                  openSet === s.id ? 'bg-border' : ''
                }`}
                onClick={() => setOpenSet((o) => (o === s.id ? null : s.id))}
              >
                {meta.short || workingIndex}
              </button>
              <span className="truncate text-sm text-neutral-500">{prev ? formatSet(prev, type, unit) : '–'}</span>
              {cols.map((c) => (
                <SetField
                  key={c.kind}
                  kind={c.kind}
                  label={`${c.label} Satz ${i + 1}`}
                  done={s.completed}
                  value={fieldText(s, c.kind, unit)}
                  placeholder={fieldText(prev, c.kind, unit)}
                  onChange={(text) => {
                    const patch = parseField(text, c.kind, unit);
                    if (patch) onSetChange(s.id, patch);
                  }}
                />
              ))}
              {!hideCheck && (
                <button
                  aria-label={s.completed ? 'Satz wieder öffnen' : 'Satz abhaken'}
                  aria-pressed={s.completed}
                  className={`flex h-10 items-center justify-center rounded-md text-lg ${
                    s.completed ? 'bg-accent text-white' : 'bg-border text-neutral-400'
                  }`}
                  onClick={() => onToggleSet(s, prev)}
                >
                  ✓
                </button>
              )}
            </div>
            {openSet === s.id && (
              <div className="flex flex-wrap gap-2 px-1 py-2 text-sm">
                {SET_TYPES.map((t) => (
                  <button
                    key={t.type}
                    className={`min-h-10 rounded-md px-3 ${s.type === t.type ? 'bg-accent text-white' : 'bg-border'}`}
                    onClick={() => {
                      onSetType(s.id, t.type);
                      setOpenSet(null);
                    }}
                  >
                    {t.label}
                  </button>
                ))}
                <button
                  className="min-h-10 rounded-md bg-border px-3 text-red-400"
                  onClick={() => {
                    onRemoveSet(s.id);
                    setOpenSet(null);
                  }}
                >
                  Satz löschen
                </button>
              </div>
            )}
          </div>
        );
      })}

      <button className="mt-2 min-h-11 w-full rounded-lg bg-border text-sm font-medium" onClick={onAddSet}>
        + Satz hinzufügen
      </button>
    </section>
  );
}
