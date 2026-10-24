import { useRef, useState } from 'react';
import { applyStrongImport, previewStrongImport, type StrongPreview } from '../db/strongImport';

const date = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
const btn = 'min-h-11 rounded-lg px-4 font-medium';

/** Settings block: import the CSV exports of the Strong app, with a preview before anything is written. */
export default function StrongImportSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<StrongPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onFiles(files: File[]) {
    setMessage(null);
    setPreview(null);
    if (!files.length) return;
    setBusy(true);
    try {
      const p = await previewStrongImport(files);
      const nothing = !p.found.workouts && !p.found.templates && !p.found.weight;
      if (nothing) setMessage('Das sind keine Strong-Exporte. Erwartet werden die CSV-Dateien für Workouts, Vorlagen oder Gewicht.');
      else setPreview(p);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Die Dateien konnten nicht gelesen werden.');
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    if (!preview) return;
    setBusy(true);
    try {
      const { plan } = preview;
      await applyStrongImport(plan);
      setMessage(
        `Import fertig: ${plan.workouts.length} Workouts, ${plan.templates.length} Vorlagen, ${plan.measurements.length} Gewichtseinträge und ${plan.newExercises.length} neue Übungen.`,
      );
      setPreview(null);
    } catch (e) {
      setMessage(e instanceof Error ? `Import fehlgeschlagen: ${e.message}` : 'Import fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  const p = preview?.plan;
  const nothingNew = p && !p.workouts.length && !p.templates.length && !p.measurements.length && !p.newExercises.length;

  return (
    <section className="mt-8 max-w-xl space-y-3" aria-labelledby="strong-h">
      <h2 id="strong-h" className="text-sm font-semibold uppercase text-neutral-400">
        Aus Strong importieren (CSV)
      </h2>
      <p className="text-sm text-neutral-400">
        Wähle die CSV-Dateien aus dem Strong-Export (Workouts, Vorlagen, Gewicht), am besten alle auf einmal. Du siehst zuerst
        eine Vorschau, nichts wird ohne deine Bestätigung geändert. Der Import ergänzt nur und lässt sich gefahrlos wiederholen.
      </p>
      <button
        className={`${btn} border border-border bg-surface text-left disabled:opacity-60`}
        disabled={busy}
        onClick={() => fileRef.current?.click()}
      >
        {busy ? 'Lese Dateien …' : 'CSV-Dateien wählen …'}
      </button>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".csv,text/csv,text/comma-separated-values"
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          void onFiles(files);
        }}
      />

      {preview && p && (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-4 text-sm" aria-label="Import-Vorschau">
          <h3 className="font-semibold">Vorschau</h3>
          <ul className="space-y-1">
            {preview.found.workouts !== undefined && (
              <li>
                <strong>{p.workouts.length}</strong> Workouts werden importiert
                {p.range && ` (${date(p.range.from)} bis ${date(p.range.to)})`}
                {p.already.workouts > 0 && `, ${p.already.workouts} sind schon vorhanden`}
              </li>
            )}
            {preview.found.templates !== undefined && (
              <li>
                <strong>{p.templates.length}</strong> Vorlagen
                {p.already.templates > 0 && `, ${p.already.templates} schon vorhanden`}
              </li>
            )}
            {preview.found.weight !== undefined && (
              <li>
                <strong>{p.measurements.length}</strong> Gewichtseinträge (ein Wert pro Tag)
                {p.already.measurements > 0 && `, ${p.already.measurements} Tage haben schon einen Eintrag und bleiben unverändert`}
              </li>
            )}
            <li>
              Übungen: <strong>{p.mappedExercises.length}</strong> werden dem Katalog zugeordnet, <strong>{p.newExercises.length}</strong>{' '}
              als eigene Übungen angelegt
            </li>
          </ul>

          {p.newExercises.length > 0 && (
            <details>
              <summary className="min-h-11 cursor-pointer py-2 text-accent">Neue eigene Übungen anzeigen</summary>
              <ul className="list-disc space-y-0.5 pl-5 text-neutral-300">
                {p.newExercises.map((e) => (
                  <li key={e.id}>{e.name}</li>
                ))}
              </ul>
              <p className="mt-1 text-neutral-500">Muskeln und Ausrüstung kannst du später in der Übung bearbeiten.</p>
            </details>
          )}
          {p.mappedExercises.length > 0 && (
            <details>
              <summary className="min-h-11 cursor-pointer py-2 text-accent">Zuordnung zum Katalog anzeigen</summary>
              <ul className="space-y-0.5 text-neutral-300">
                {p.mappedExercises.map((m) => (
                  <li key={m.strong}>
                    {m.strong} <span className="text-neutral-500">→</span> {m.library}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {p.warnings.map((w) => (
            <p key={w} className="rounded-lg bg-amber-400/10 p-2 text-amber-200">
              ⚠ {w}
            </p>
          ))}
          {p.suspicious.length > 0 && (
            <details>
              <summary className="min-h-11 cursor-pointer py-2 text-accent">
                Ausgelassene und angepasste Einträge anzeigen ({p.suspicious.length})
              </summary>
              <ul className="list-disc space-y-0.5 pl-5 text-neutral-300">
                {p.suspicious.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </details>
          )}
          {preview.unknownFiles.length > 0 && (
            <p className="text-neutral-400">Nicht erkannt und ignoriert: {preview.unknownFiles.join(', ')}</p>
          )}
          {preview.skippedWeightRows > 0 && (
            <p className="text-neutral-400">{preview.skippedWeightRows} Zeilen der Gewichtsdatei waren keine Gewichtswerte und werden übersprungen.</p>
          )}

          {nothingNew ? (
            <p className="text-neutral-300">Alles aus diesen Dateien ist schon vorhanden, es gibt nichts zu importieren.</p>
          ) : (
            <div className="flex gap-2">
              <button className={`${btn} bg-accent text-white disabled:opacity-60`} disabled={busy} onClick={() => void onImport()}>
                Jetzt importieren
              </button>
              <button className={`${btn} bg-border`} disabled={busy} onClick={() => setPreview(null)}>
                Abbrechen
              </button>
            </div>
          )}
        </div>
      )}
      {message && (
        <p role="status" className="text-sm text-accent">
          {message}
        </p>
      )}
    </section>
  );
}
