# CLAUDE.md

Private Strong-style workout tracker (PWA). Full spec: see PLAN.md.


## Stand (read this first in every new session)
- Last update: 2026-10-25. All phases are done and pushed to `main`: PLAN.md phases 0-8, endurance/triathlon module E0-E9 and T1-T3 (ENDURANCE-PLAN.md), run timer overlay, drag-and-drop reordering, app tour.
- Endurance module (Ausdauer): goals + rule-based plans (run 5 km-marathon, sprint/olympic triathlon), zones (pace/HR/power), load model (fitness/fatigue/form), plan adaptation, GPX/TCX/FIT import, dashboards per sport. Code: `src/lib/` (planGenerator*, zones, load, adapt, endurance*, activity*), `src/db/plans.ts`, `src/pages/Endurance.tsx`.
- Not yet tried with real data: the triathlon plan and the new dashboards (only unit tests and seeded test data). Feedback from real use is the likely next work.
- Open ideas, not started: Apple Health export import, Web Bluetooth live heart rate, half-ironman distances.
- Working rules that are easy to forget: update the app tour for every new feature; stop at each phase and ask about the model switch; git needs `git -c safe.directory=F:/Repos/workout-tracker`; commit and push only when asked.
- Verify with `npx vitest run` and `npm run build`; check new screens at 390 px and desktop width.

## Decisions
- Hosting: GitHub Pages, repo variant A (project page), repo name `workout-tracker` -> `base: '/workout-tracker/'`, URL `https://<user>.github.io/workout-tracker/`.
- Exercise images: not precached. Precache only app shell + seed JSON; images via Workbox runtime caching (CacheFirst).

## Rules
- UI language: German. Code and comments: English. Exercise names and instructions stay English on purpose (no translation); search understands German terms.
- App updates: service worker uses `registerType: 'prompt'`; a new version only activates via the banner (or at a cold start with no running workout). Never switch back to silent auto-reload.
- Phase 8 is done (offline, install hint, backup reminder, update banner, splash screens, offline image download).
- Scope is closed after Phase 8: no TV mode, no native iOS app, no online sync. Exception: the endurance/triathlon module (ENDURANCE-PLAN.md, phases E0-E9, T1-T3, all done; section 10 order wins) is deliberately opened. Its rules: plan generator rule-based in pure TS (no AI, no server), no browser GPS (manual entry or GPX/TCX/FIT file import), RPE zones as fallback with optional heart rate/power. Planned sessions live in `plannedSessions`; actual training stays normal `workouts` linked via `plannedSessionId` ("done" is derived, only "skipped" is stored). Zones/paces are computed from profile values, never stored. Only copy the structure of third-party training plans, never their texts. Activity import (Ausdauer > Heute): GPX/TCX/FIT parsed in the browser (src/lib/activityFiles.ts, no DOM, no libraries), run, bike and swim; ids are deterministic (`import-<source>-<start>-<distance>`) and a start within 2 min of an imported workout counts as duplicate, so repeating is safe.
- Mobile-first (390 px width), touch targets >= 44 px, dark mode default.
- Responsive for every screen: phone = bottom nav + single column; `md` and up = side nav, wider content, multi-column lists/detail layouts; `2xl` (TV, large screens) = larger base font. Check new screens at 390 px and at desktop width.
- Exercise library is a curated core list for regular gym and home training (`scripts/exercise-core.json`, ~200). Prefer too few over too many; the user creates missing ones as custom exercises. Change the list there, then run `npm run seed`.
- Local-first: all data in Dexie. No backend and no online sync (decided against it); moving data between devices is done with the export/import in Settings. Keep that export complete when adding new data types.
- Model-switch stop: before each phase / sub-task from PLAN.md section 7a, stop, name the recommended model and ask (AskUserQuestion: "Umgestellt, weiter" / "Mit aktuellem Modell weitermachen" / "Abbrechen"). Do not start without confirmation. At the end of each phase, name the recommended model for the next one.
- GitHub Pages: `base` and manifest scope/start_url/id on the repo path, `HashRouter`, assets only via `import.meta.env.BASE_URL`. Never commit personal data (`*.backup.json` in .gitignore).
- Stats are always computed from sets, never stored twice.
- Timers use timestamps (end time), never counting intervals.
- No rest timer after completing a set (removed on request); don't reintroduce it.
- App tour (src/lib/tour.ts, started only by the button on the start page): every new feature or screen updates the tour texts and, if needed, its steps and data-tour anchors.
- Every stats function gets vitest unit tests.
- Do not copy Strong assets, logos or texts.
- Strong CSV import (Settings): table of known exercise names in src/lib/strongExercises.ts; only clear equivalents map to the library, everything else becomes a custom exercise. Import only adds, ids are deterministic (safe to repeat). Optional check against a real export: STRONG_DIR=<folder> npx vitest run src/db/strongImport.test.ts.

@Efficiency.md
