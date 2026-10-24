# Plan: Private Workout-Tracker-App (Strong-Style)

Ziel: Persönliche Fitness-App für Zuhause und Fitnessstudio, orientiert an Strong. Läuft im Web, installierbar auf dem iPhone (PWA), später optional auf dem Fernseher.

Dieses Dokument ist als Arbeitsgrundlage für Claude Code gedacht. Lege es als `PLAN.md` ins Projekt-Root und arbeite die Phasen der Reihe nach ab.

---

## 1. Entscheidungen

| Thema | Entscheidung | Warum |
|---|---|---|
| Plattform | **PWA** (Web-App, über Safari "Zum Home-Bildschirm" installiert) | Läuft auf iPhone, Desktop und TV-Browser mit einer Codebasis. Kein Developer-Account, kein 7-Tage-Signatur-Ablauf. |
| Frontend | Vite + React + TypeScript | Schnell, einfach, Claude Code kennt den Stack sehr gut. |
| Styling | Tailwind CSS, Mobile-first, Dark Mode als Standard | Strong ist dunkel und minimalistisch. |
| Lokale Daten | **Dexie (IndexedDB)**, local-first | Funktioniert offline im Studio (oft schlechter Empfang). |
| Charts | Recharts | Linien- und Balkendiagramme für Gewicht, Workouts/Woche, Übungsverlauf. |
| Routing | React Router | Tab-Navigation unten. |
| State | Zustand (nur für das aktive Workout), sonst Dexie `useLiveQuery` | Einfach, wenig Boilerplate. |
| PWA | `vite-plugin-pwa` (Service Worker, Manifest, Icons) | Offline und installierbar. |
| Hosting | **GitHub Pages** (statische Dateien, HTTPS, kostenlos) | Nötig, damit Safari die PWA installieren und den Service Worker aktivieren darf. Es liegt nur Code auf dem Server, deine Daten bleiben lokal auf dem Gerät. Details in Abschnitt 6a. |
| Sync (optional, Phase 9) | Supabase (Postgres + Auth) | Geräteübergreifend, später TV-Steuerung per Handy. |
| Native iOS (optional, Phase 11) | Capacitor um die gleiche Web-App | Nur falls PWA nicht reicht. Kostenloser Apple-ID-Build läuft 7 Tage, mit Developer-Account (99 $/Jahr) ein Jahr. |

Hinweis zur PWA auf iOS: Ein Wake Lock (Display bleibt an) ist in Safari verfügbar, Push-Benachrichtigungen funktionieren nur für installierte PWAs, Background Sync gibt es nicht. Konsequenz für die App: Der Pausen-Timer muss auf **Zeitstempeln** basieren (Endzeit speichern, bei Rückkehr neu berechnen), nicht auf `setInterval`. Außerdem regelmäßiger JSON-Export als Backup einbauen.

---

## 2. Was Strong bietet (Referenz)

Aus der Strong-Website und den App-Store-Beschreibungen belegt:

- Sehr einfaches Workout-Logging, Routinen (Vorlagen), eigene Übungen
- Detaillierte Übungsanleitungen mit wachsender Bibliothek an animierten Videos, dazu anatomische Darstellung der Muskeln
- Erweiterte Statistiken: Personal Records, Fortschritt, geschätztes 1RM, Gesamtgewicht (Volumen)
- Mehrere Übungstypen, u. a. Assisted Bodyweight und Dauer-Übungen
- Körpermaße-Tracker (Gewicht, Körperfett, Umfänge)
- Supersets, Warm-up-Rechner, RPE, Custom Timer, Dark Mode, CSV-Export, Workout-Scheduling, Muscle Heat Map, Workout-Sharing
- Apple Watch, Apple Health, Widgets (für dich nicht nötig)

Strongs Übungs-Detailansicht ist in Tabs gegliedert (About / History / Charts / Records). Das ist aus meiner Erfahrung mit der App, nicht aus den recherchierten Quellen. Wirf dafür kurz einen Blick in die Screenshots im App Store: https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577

Die Strong-Screenshots dienen nur als Orientierung. Kopiere keine Assets oder Icons von Strong, baue ein eigenes Design.

---

## 3. Features und Screens

Untere Tab-Leiste: **Profil · Verlauf · Workout · Übungen** (Rekorde als Tab innerhalb von "Übungen" bzw. als eigener Screen).

### 3.1 Profil
- Personendaten: Name, Geburtsjahr, Größe, Geschlecht (optional), Einheiten (kg/lb, Standard kg)
- Aktuelles Gewicht mit Button "Gewicht eintragen" (Datum + Wert, bearbeitbar)
- Ziele: **Zielgewicht** und **Workouts pro Woche**
- Diagramm 1: Gewichtsverlauf als Linie mit gestrichelter Ziellinie, Zeitraumfilter (1M / 3M / 6M / 1J / Alles)
- Diagramm 2: Workouts pro Woche als Balken (letzte 12 Wochen) mit Ziellinie
- Optional später: weitere Körpermaße (Körperfett, Umfänge)

### 3.2 Verlauf
- Liste aller abgeschlossenen Workouts, neueste zuerst, gruppiert nach Monat
- Karte pro Workout: Name, Datum, Dauer, Gesamtvolumen, Übungsliste mit besten Sätzen, Rekord-Badges
- Detailansicht: alle Übungen mit allen Sätzen (Gewicht × Wiederholungen), Notizen
- Aktionen: Workout als Vorlage speichern, Workout wiederholen, bearbeiten, löschen
- Optional: Kalenderansicht mit markierten Trainingstagen

### 3.3 Workout starten
- Button "Leeres Workout starten"
- Liste der gespeicherten **Vorlagen** und "Zuletzt durchgeführt" zum direkten Starten
- Aktives Workout:
  - Übung hinzufügen (Suche + Filter, gleiche Auswahl wie im Übungen-Tab)
  - Pro Übung eine Satz-Tabelle: Satz 1 ist vorhanden, "+ Satz hinzufügen" für weitere
  - Eingaben: Wiederholungen und Gewicht (bei Körpergewichtsübungen: Zusatzgewicht, optional)
  - Spalte "Vorher" zeigt die Werte vom letzten Mal, Abhaken per Checkbox
  - Satztyp: Normal, Aufwärmen, Dropset, Bis zum Versagen
  - Pausen-Timer nach Abhaken (Standard z. B. 90 s, pro Übung einstellbar)
  - Notiz pro Übung und pro Workout, Übung löschen oder umsortieren, Supersets (später)
  - Laufender Timer, "Workout beenden" (Zusammenfassung mit neuen Rekorden), "Verwerfen"
  - **Auto-Save**: Jeder Zwischenstand wird sofort in IndexedDB gespeichert, damit nichts verloren geht, wenn Safari die App im Hintergrund beendet
  - Display-Wake-Lock während des Workouts

### 3.4 Übungen
- Alphabetische Liste mit Buchstaben-Index und Suche
- Filter: **Ausrüstung** (Ohne Geräte / Mit Geräten, zusätzlich Hantel, Kurzhantel, Maschine, Kabelzug, Bänder, …), **Muskelgruppe**, **Kategorie**, "Eigene Übungen"
- Übungsdetail mit Tabs:
  - **Info**: Name, Ausrüstung, Schwierigkeit, Schritt-für-Schritt-Anleitung, Animation (siehe 5.), Körper-Silhouette mit farbig hervorgehobenen Muskeln (primär kräftig, sekundär heller)
  - **Verlauf**: Anzahl Durchführungen, "Zuletzt am …", Liste aller Einheiten mit Sätzen
  - **Diagramme**: bestes Gewicht, geschätztes 1RM, Volumen über Zeit
  - **Rekorde**: höchstes Gewicht, meiste Wiederholungen, bester Satz (Volumen), bestes geschätztes 1RM
- Eigene Übung anlegen (Name, Ausrüstung, Muskeln, Typ, eigene Anleitung/Bild)
- **Rekorde-Tab** (global): Tabelle aller Übungen mit Max-Gewicht und Max-Wiederholungen, sortier- und filterbar

---

## 4. Datenmodell (Dexie / TypeScript)

```ts
type Equipment = 'none' | 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'band' | 'kettlebell' | 'other';
type ExerciseType = 'weight_reps' | 'bodyweight_reps' | 'assisted_bodyweight' | 'duration' | 'distance_duration';
type SetType = 'normal' | 'warmup' | 'drop' | 'failure';

interface Exercise {
  id: string;                 // z. B. "Barbell_Bench_Press" (aus der Datenbank) oder uuid für eigene
  name: string;
  nameDe?: string;
  equipment: Equipment;
  type: ExerciseType;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];     // Deutsch, falls übersetzt
  images: string[];           // relative Pfade, 2 Frames
  level?: 'beginner' | 'intermediate' | 'expert';
  isCustom: boolean;
}

interface WorkoutSet {
  id: string;
  type: SetType;
  reps?: number;
  weightKg?: number;          // bei bodyweight_reps = Zusatzgewicht
  durationSec?: number;
  rpe?: number;
  completed: boolean;
}

interface WorkoutExercise {
  id: string;
  exerciseId: string;
  order: number;
  supersetGroup?: number;
  restSec?: number;
  note?: string;
  sets: WorkoutSet[];
}

interface Workout {
  id: string;
  name: string;
  startedAt: number;          // epoch ms
  finishedAt?: number;        // leer = aktiv
  note?: string;
  exercises: WorkoutExercise[];
  templateId?: string;
}

interface Template { id: string; name: string; exercises: Omit<WorkoutExercise,'sets'> & { sets: { type: SetType; reps?: number; weightKg?: number }[] }[]; }

interface BodyMeasurement { id: string; date: string /* YYYY-MM-DD */; weightKg: number; bodyFatPct?: number; }
interface Profile { name: string; birthYear?: number; heightCm?: number; unit: 'kg'|'lb'; targetWeightKg?: number; workoutsPerWeekGoal: number; }
```

Rekorde und Statistiken werden **aus den Sätzen berechnet** (reine Funktionen in `src/lib/stats.ts`), nicht separat gespeichert. Geschätztes 1RM nach Epley: `w * (1 + reps/30)`. Nur Sätze mit `completed = true` und Typ `normal`/`drop`/`failure` zählen (Aufwärmen nicht).

---

## 5. Übungsdaten, Animationen, Muskel-Hervorhebung

Das ist der aufwendigste Teil. Empfohlene Quellen:

1. **free-exercise-db** (https://github.com/yuhonas/free-exercise-db): Unlicense (gemeinfrei), 800+ Übungen als JSON mit `primaryMuscles`, `secondaryMuscles`, `equipment`, `level`, `category`, `instructions` (Englisch) und je 2 Bildern (Start- und Endposition). Passt am besten als Seed. Bild-Rohdateien liegen unter `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<id>/0.jpg`. Beim Import die `equipment`-Werte prüfen (z. B. `body only` → `none`, Felder können `null` sein).
2. **RepDB Free-Tier** (https://github.com/RepDB/exercise-dataset): 250 Übungen mit Anleitungen auf Deutsch, Englisch und Spanisch und einheitlichen Illustrationen. Attribution Pflicht. Optional als deutsche Ergänzung.
3. **wger** (https://wger.de, API `https://wger.de/api/v2/exerciseinfo/`): offene Datenbank, Lizenzen pro Übung (meist CC-BY-SA), Bilder und mehrsprachige Texte. Als Fallback oder Ergänzung.

Hinweis: Die Bilder in free-exercise-db stammen aus einem älteren Datensatz, die Herkunft der Bilder ist nicht für alle klar geklärt. Für den rein privaten Gebrauch ist das unkritisch, bei einer Veröffentlichung der App müsste man die Lizenzlage nochmal prüfen.

**Animation wie bei Strong:** Echte GIF-Bibliotheken (z. B. ExerciseDB-API mit GIFs) sind kostenpflichtig oder lizenzseitig unklar. Pragmatische Lösung: Die zwei Bilder (Start/Ende) als **automatische Überblendung** im Loop anzeigen (CSS-Animation, ca. 1 s pro Frame). Sieht wie eine einfache Animation aus. Später optional eigene Clips ergänzen.

**Muskel-Hervorhebung:** Eine Körper-Silhouette (Vorder- und Rückansicht) als SVG mit je einem Pfad pro Muskelgruppe. Primäre Muskeln kräftig einfärben (z. B. Akzentfarbe), sekundäre in hellerem Ton. Option: Bibliothek `react-body-highlighter` (npm, MIT) prüfen, ob die Muskelnamen zur Datenbank passen. Sonst eigene SVG bauen und ein Mapping-Objekt `muscleName → svgPathId` pflegen. Die Muskelnamen der Datenbank (Englisch, z. B. `quadriceps`, `lats`, `chest`) müssen auf dieses Mapping abgebildet werden.

**Deutsche Anleitungen:** Beim Seed-Skript die englischen Anleitungen und Namen einmalig übersetzen (z. B. mit der Claude API oder von Hand für die wichtigsten 100 Übungen) und als `nameDe` / `instructions` im Seed-JSON ablegen. Die App zeigt Deutsch, fällt sonst auf Englisch zurück.

---

## 6. Projektstruktur

```
workout-app/
├─ CLAUDE.md
├─ PLAN.md
├─ public/ (Icons, Manifest, /exercises/<id>/0.jpg, 1.jpg)
├─ scripts/
│  └─ build-exercise-seed.ts      # lädt free-exercise-db, mappt, übersetzt, schreibt src/data/exercises.seed.json
├─ src/
│  ├─ db/ (dexie.ts, schema, seed.ts, backup.ts)
│  ├─ lib/ (stats.ts, 1rm.ts, units.ts, dates.ts, muscleMap.ts)
│  ├─ store/ (activeWorkout.ts)
│  ├─ components/ (BottomNav, SetRow, ExercisePicker, MuscleBody, ExerciseAnimation, Charts/…)
│  ├─ pages/ (Profile, History, WorkoutStart, ActiveWorkout, Exercises, ExerciseDetail, Records, Settings)
│  └─ main.tsx, App.tsx
└─ tests/ (vitest für stats.ts, Playwright-Smoketest)
```

`CLAUDE.md` (für Claude Code, sinngemäß):
- Sprache der UI: Deutsch. Code und Kommentare: Englisch.
- Mobile-first (Breite 390 px), große Touch-Ziele (min. 44 px), Dark Mode Standard.
- Local-first: Alle Daten in Dexie, kein Backend nötig für Phasen 0–8.
- Modellwechsel-Stopp: Vor jeder Phase bzw. Teilaufgabe laut Abschnitt 7a anhalten, das empfohlene Modell nennen und per Rückfrage warten, bis ich mit `/model` umgestellt und bestätigt habe. Nie ohne diese Bestätigung mit der Phase beginnen.
- Hosting auf GitHub Pages: `base` und Manifest-Scope auf den Repo-Pfad, `HashRouter`, Assets nur über `import.meta.env.BASE_URL`. Keine persönlichen Daten ins Repo committen.
- Statistiken immer aus Sätzen berechnen, nie doppelt speichern.
- Timer mit Zeitstempeln, nie mit hochzählenden Intervallen.
- Jede Statistikfunktion bekommt Unit-Tests (vitest).
- Keine Strong-Assets, -Logos oder -Texte kopieren.

---

## 6a. Hosting mit GitHub Pages

Die App besteht nach dem Build nur aus statischen Dateien. Sie wird per GitHub Action automatisch veröffentlicht. Persönliche Daten (Workouts, Gewicht, Ziele) liegen ausschließlich in IndexedDB auf dem jeweiligen Gerät und werden nie hochgeladen.

**Repo-Variante (eine entscheiden, vor Phase 0):**
- **A) Projekt-Seite:** URL `https://<name>.github.io/<repo>/`. Die App liegt in einem Unterpfad, daher muss alles darauf konfiguriert werden (siehe unten).
- **B) User-Seite:** Repo heißt `<name>.github.io`, URL `https://<name>.github.io/`. Die App liegt im Root, der Unterpfad-Aufwand entfällt. Nur eine solche Seite pro Konto.

**Einmalige Einrichtung im neuen Repo (vor dem ersten Deploy):**
1. Repo auf GitHub anlegen. Bei einem kostenlosen Konto muss das Repo **öffentlich** sein, GitHub Pages aus privaten Repos gibt es nur in bezahlten Tarifen. Das ist okay, siehe Privatsphäre unten.
2. Im Repo: **Settings → Pages → Build and deployment → Source: "GitHub Actions"** auswählen (nicht "Deploy from a branch").
3. **Settings → Actions → General → Workflow permissions**: Actions müssen erlaubt sein. Der Workflow braucht in der Datei selbst `permissions: contents: read, pages: write, id-token: write` und die Umgebung `github-pages`.
4. Workflow-Datei committen und auf `main` pushen. Der erste Lauf erscheint unter dem Tab **Actions**, danach steht die URL unter Settings → Pages.
5. Ist die Seite nach dem ersten Lauf leer oder 404: Prüfen, ob `base` zum Repo-Namen passt (Groß-/Kleinschreibung!).

**Mehrere Pages pro Konto:** Du kannst beliebig viele Projekt-Seiten haben, jedes Repo bekommt seine eigene unter `<name>.github.io/<repo>/`. Nur die **User-Seite** (Repo `<name>.github.io`, im Root) gibt es einmal pro Konto. Für dieses Projekt reicht ein normales Repo mit Projekt-Seite, du brauchst also keine bestehende Seite zu ersetzen.

**Konfiguration bei Variante A** (`<repo>` = Repo-Name):
- `vite.config.ts`: `base: '/<repo>/'`
- Router: **`HashRouter`** verwenden (URLs wie `/#/history`). GitHub Pages hat keine Rewrites, ein direkter Aufruf einer Unterseite würde sonst 404 liefern. Bei Variante B reicht auch `BrowserRouter` plus eine `404.html`, die eine Kopie der `index.html` ist.
- PWA-Manifest (in `vite-plugin-pwa`): `start_url: '/<repo>/'`, `scope: '/<repo>/'`, `id: '/<repo>/'`. Icons und Service Worker müssen relativ zu diesem Pfad geladen werden.
- Bilder und Seed-Daten **nie mit absolutem Pfad** (`/exercises/...`) laden, sondern über `import.meta.env.BASE_URL`.

**Deployment (GitHub Action):**
- Workflow `.github/workflows/deploy.yml`: bei Push auf `main` → `npm ci` → `npm run build` → Artefakt `dist/` hochladen (`actions/upload-pages-artifact`) → veröffentlichen (`actions/deploy-pages`).
- In den Repo-Einstellungen unter Pages als Quelle "GitHub Actions" wählen.

**Wichtig bei Updates:** Ein Service Worker cached die App. Nach einem Deploy sieht ein Gerät die neue Version erst nach dem nächsten Öffnen bzw. Neuladen. `vite-plugin-pwa` mit `registerType: 'autoUpdate'` verwenden und in den Einstellungen die Versionsnummer anzeigen, damit man das prüfen kann.

**Privatsphäre:** Bei einem kostenlosen GitHub-Konto ist die veröffentlichte Seite öffentlich erreichbar, auch wenn das Repo privat ist. Das ist okay, solange im Repo keine persönlichen Daten liegen. Keine Backups, Exporte oder Testdaten mit echten Gewichtswerten committen (`*.backup.json` in `.gitignore`).

---

## 7. Umsetzungsphasen

Jede Phase endet mit einem lauffähigen Stand. Nach jeder Phase committen.

**Phase 0 – Setup**
Vite + React + TS + Tailwind + React Router + Dexie + Recharts + Zustand + vite-plugin-pwa. Bottom-Navigation mit 4 leeren Tabs, Dark Theme, Manifest und Icons. App läuft auf dem Handy im Heimnetz (`vite --host`). **GitHub Pages gleich in dieser Phase einrichten** (Abschnitt 6a): `base`, `HashRouter`, Manifest-Scope, Deploy-Workflow. Eine leere App mit 4 Tabs wird sofort veröffentlicht und einmal testweise auf dem iPhone installiert. So fallen Pfad- und Installationsprobleme früh auf, nicht erst am Ende.

**Phase 1 – Datenbank und Übungs-Seed**
Dexie-Schema laut Abschnitt 4. Seed-Skript `build-exercise-seed.ts`: free-exercise-db laden, auf das eigene Schema mappen, Bilder nach `public/exercises/` kopieren, Seed-JSON schreiben. Beim ersten Start in Dexie importieren. Backup-Funktion (Export/Import als JSON) in den Einstellungen.

**Phase 2 – Übungen**
Alphabetische Liste mit Index, Suche und Filtern (Ausrüstung, Muskelgruppe). Detailansicht Tab "Info" mit Anleitung, Überblend-Animation und Muskel-Silhouette. Eigene Übung anlegen.

**Phase 3 – Aktives Workout**
Leeres Workout starten, Übungen hinzufügen, Sätze hinzufügen/entfernen, Reps und Gewicht eingeben, Satz abhaken, Spalte "Vorher", Pausen-Timer, Wake Lock, Auto-Save, Workout beenden/verwerfen.

**Phase 4 – Verlauf**
Liste und Detailansicht, Löschen und Bearbeiten, "Workout wiederholen".

**Phase 5 – Vorlagen**
Workout als Vorlage speichern, Vorlagenliste auf dem Start-Screen, Workout aus Vorlage oder aus vorherigem Workout starten (Gewichte vorbefüllt).

**Phase 6 – Statistiken pro Übung und Rekorde**
`stats.ts` mit Tests: Max-Gewicht, Max-Wiederholungen, bester Satz, 1RM, Volumen. Übungsdetail-Tabs "Verlauf", "Diagramme", "Rekorde". Globaler Rekorde-Tab. Rekord-Badges in Verlauf und Workout-Zusammenfassung.

**Phase 7 – Profil und Ziele**
Profildaten, Gewicht eintragen/bearbeiten, Zielgewicht, Workouts/Woche-Ziel, Gewichtsdiagramm mit Ziellinie, Wochenbalken mit Ziellinie.

**Phase 8 – PWA-Feinschliff**
Offline-Test (Flugmodus), Install-Hinweis für iOS (Share → Zum Home-Bildschirm), Icons, Splash, Safe-Area-Insets (Notch/Home-Bar), automatische Backup-Erinnerung. Prüfen, dass die Installation von der GitHub-Pages-URL funktioniert (Safari → Teilen → "Zum Home-Bildschirm"), die App im Vollbild ohne Safari-Leiste startet und nach dem Installieren im Flugmodus läuft. Update-Verhalten testen: neue Version deployen, App neu öffnen, Versionsnummer prüfen.

**Phase 9 – Sync (optional)**
Supabase-Projekt, Auth (E-Mail-Link), Tabellen spiegeln das Dexie-Schema, Row-Level-Security, einfacher Sync (Last-write-wins mit `updatedAt`). Wird nur gebraucht, wenn du mehrere Geräte parallel nutzen oder das Handy als Fernbedienung für den TV nutzen willst.

**Phase 10 – TV-/Heimtraining-Modus (optional)**
Eigene Route `/tv` mit großer Typografie und hohem Kontrast: eine Übung nach der anderen, große Animation, Satz- und Pausen-Countdown, Weiter/Zurück per Fernbedienung (Pfeiltasten/Enter, sichtbarer Fokus). Anzeigewege: Browser des TV, AirPlay (Apple TV) oder Chromecast/Tab-Spiegelung vom Handy. Mit Phase 9 kann das Handy als Eingabegerät dienen und der TV zeigt nur an.

**Phase 11 – Native iOS (optional)**
Nur wenn PWA nicht reicht (z. B. Apple Health, Haptik). Capacitor um den Web-Build, Xcode, Signatur mit Apple-ID (7 Tage) oder Developer-Account (1 Jahr, TestFlight).

---

## 7a. Empfohlenes Claude-Modell pro Phase

Das ist eine Faustregel nach Schwierigkeit und Kosten, keine Benchmark-Auswertung. Im Zweifel mit dem günstigeren Modell starten und nur bei Problemen (Fehler, die sich nicht lösen lassen, unsaubere Architektur) auf das stärkere wechseln. In Claude Code wechselst du mit `/model`.

Aktuell verfügbar: **Haiku 5.5** (schnell, günstig), **Sonnet 5.5** (Standard für den Alltag), **Opus 5.5** (stärker bei komplexen Aufgaben), **Fable 5.1** (stärkstes Modell, hohe Kosten).

| Phase | Modell | Begründung |
|---|---|---|
| 0 – Setup (Vite, Tailwind, PWA, GitHub Pages) | **Sonnet 5.5** | Standardaufgabe, viel Konfiguration. Wenn Manifest/Scope/Router auf dem iPhone Probleme machen, kurz **Opus 5.5** zum Debuggen. |
| 1 – Datenbank und Seed-Skript | **Sonnet 5.5** | Schema und Mapping sind klar definiert. |
| 1 – Übersetzung der Übungsnamen und Anleitungen ins Deutsche | **Haiku 5.5** (oder Sonnet bei Qualitätsproblemen) | Hohe Menge, einfache Aufgabe. Stichproben prüfen, vor allem Fachbegriffe. |
| 2 – Übungsliste, Filter, Detailansicht, Überblend-Animation | **Sonnet 5.5** | Normale UI-Arbeit. |
| 2 – Muskel-Silhouette (SVG + Mapping) | **Opus 5.5** | Kniffliger Teil: saubere Pfade, Mapping aller Muskelnamen, visuelle Prüfung. Mehrere Iterationen mit Screenshots einplanen. |
| 3 – Aktives Workout (Zustand, Auto-Save, Timer, Wake Lock) | **Opus 5.5** | Zentrale Komponente mit vielen Randfällen (App wird im Hintergrund beendet, Timer per Zeitstempel, Datenverlust vermeiden). Hier lohnt sich das stärkere Modell. |
| 4 – Verlauf | **Sonnet 5.5** | Listen und Detailansichten. |
| 5 – Vorlagen | **Sonnet 5.5** | Kopieren und Vorbefüllen von Daten. |
| 6 – Statistiken und Rekorde (`stats.ts` + Tests) | **Opus 5.5** | Fachlogik mit Randfällen (Aufwärmsätze, Körpergewicht + Zusatzgewicht, Dauer-Übungen). Tests dazu schreiben lassen und selbst durchsehen. |
| 6/7 – Diagramme (Recharts) | **Sonnet 5.5** | Standard-Charts. |
| 7 – Profil und Ziele | **Sonnet 5.5** | Formulare, Diagramme. |
| 8 – PWA-Feinschliff, Offline-Test, Safe-Areas | **Sonnet 5.5**, bei iOS-Eigenheiten **Opus 5.5** | Service-Worker-Caching und Update-Verhalten sind fehleranfällig. |
| 9 – Sync mit Supabase (optional) | **Opus 5.5** | Konfliktbehandlung, Row-Level-Security und Auth sind sicherheits- und datenkritisch. |
| 10 – TV-Modus (optional) | **Sonnet 5.5** | UI mit Fokus-Navigation. Bei Fernbedienungsproblemen Opus. |
| 11 – Capacitor / native iOS (optional) | **Opus 5.5** | Xcode-Signatur und Build-Probleme sind schwer zu debuggen. |
| Architektur-Review vor Phase 3 und nach Phase 7 | **Opus 5.5**, optional **Fable 5.1** | Einmal das ganze Projekt gegen PLAN.md prüfen lassen. Fable lohnt sich nur, wenn Opus an etwas hängt. |
| Kleinkram (Umbenennen, Texte, Icons, Git-Commits) | **Haiku 5.5** | Schnell und günstig. |

**Modellwechsel-Stopp (verbindliche Regel für Claude Code):** Claude Code kann das Modell nicht selbst umstellen. Deshalb gilt zu **Beginn jeder Phase und jeder Teilaufgabe aus der Tabelle**:
1. Claude Code liest die empfohlene Modellwahl aus dieser Tabelle.
2. Es stoppt **vor** der ersten Änderung und fragt mich per Rückfrage (AskUserQuestion-Tool, sonst als normale Frage): "Phase N / Teilaufgabe X: empfohlenes Modell ist <Modell>. Bitte mit `/model` umstellen, dann bestätige."
3. Antwortoptionen: "Umgestellt, weiter" / "Mit aktuellem Modell weitermachen" / "Abbrechen".
4. Erst nach meiner Bestätigung wird gearbeitet. Wird das Modell innerhalb einer Phase gewechselt (z. B. Plan mit Opus, Umsetzung mit Sonnet), gilt der Stopp an jeder Wechselstelle erneut.
5. Am Ende jeder Phase nennt Claude Code kurz, welches Modell für die nächste Phase empfohlen ist.

Praktische Tipps:
- **Opus für die Planung, Sonnet für die Umsetzung:** Bei größeren Phasen (3, 6, 9) den Ansatz erst mit Opus im Plan-Modus durchsprechen und dann mit Sonnet umsetzen lassen.
- Tests zuerst: Bei Phase 6 zuerst die Testfälle schreiben lassen und von dir freigeben, dann implementieren. Das fängt Fehler im Modell ab, egal welches du nutzt.
- Pro Phase eine frische Session, damit der Kontext klein bleibt.

---

## 8. Startprompts für Claude Code

Erster Prompt (im leeren Projektordner):

```
Lies PLAN.md und CLAUDE.md. Beachte den Modellwechsel-Stopp aus Abschnitt 7a: Frage mich vor jeder
Phase, ob ich auf das empfohlene Modell umgestellt habe. Setze Phase 0 und Phase 1 um. Nutze Vite, React, TypeScript, Tailwind,
Dexie, Recharts, Zustand und vite-plugin-pwa. Das Hosting erfolgt auf GitHub Pages (Abschnitt 6a),
Repo-Variante: <A mit Repo-Name ... / B User-Seite>. Konfiguriere base, HashRouter, Manifest-Scope
und den Deploy-Workflow. Schreibe das Seed-Skript für free-exercise-db und importiere die Übungen
in Dexie. Teste mit `npm run build` und starte den Dev-Server. Committe am Ende.
```

Danach pro Phase:

```
Setze Phase N aus PLAN.md um. Frage mich zuerst nach dem Modellwechsel (Abschnitt 7a) und warte auf
meine Bestätigung. Halte dich an das Datenmodell in Abschnitt 4. Schreibe Unit-Tests für
alle neuen Berechnungen. Prüfe das Ergebnis im Browser bei 390 px Breite und committe.
```

Für die Muskel-Silhouette (Phase 2):

```
Baue die Komponente MuscleBody: SVG-Silhouette (Vorder- und Rückansicht) mit einem Pfad pro
Muskelgruppe. Props: primary: string[], secondary: string[]. Primär kräftige Akzentfarbe, sekundär
hellere Variante. Erstelle ein Mapping von den Muskelnamen der Übungsdatenbank auf die SVG-Pfade und
prüfe, dass jeder Muskelname im Seed ein Mapping hat.
```

---

## 9. Risiken und offene Punkte

- **Datenverlust in iOS:** Installierte PWAs sind weniger gefährdet als Safari-Tabs, aber ein Backup-Export bleibt Pflicht. Phase 9 löst das dauerhaft.
- **Animationen:** Überblendete Standbilder sind einfacher als die Videos von Strong. Besseres Material müsstest du lizenzieren oder selbst erzeugen.
- **Übersetzung:** Die Anleitungen sind im Seed englisch, Deutsch erfordert einen Übersetzungsschritt.
- **Muskelnamen-Mapping:** Der Aufwand für saubere SVG-Silhouetten wird gern unterschätzt. Plane dafür eine eigene Iteration ein.
- **Kein Apple Health/Watch** in der PWA-Variante.
- **GitHub Pages:** Unterpfad (`base`, Manifest-Scope) und Routing sind die typischen Stolperfallen. Die Seite ist öffentlich erreichbar, daher keine persönlichen Daten im Repo.
- **Installation in der EU:** Apple hatte für iOS 17.4 angekündigt, Home-Bildschirm-Web-Apps in der EU einzuschränken, und das nach Kritik wieder zurückgenommen. Deshalb früh (Phase 0) auf dem echten iPhone testen, ob die installierte App im Vollbild startet und ihre Daten behält.

---

## 10. Quellen

- Strong: https://www.strong.app/ und https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577
- free-exercise-db: https://github.com/yuhonas/free-exercise-db
- RepDB Free Dataset: https://github.com/RepDB/exercise-dataset
- wger: https://github.com/wger-project/wger und https://wger.de
- iOS-PWA-Fähigkeiten: https://firt.dev/notes/pwa-ios/ und https://monterail.com/blog/pwa-for-apple-ios
- GitHub Pages: https://docs.github.com/en/pages
