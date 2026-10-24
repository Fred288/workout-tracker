# CLAUDE.md

Private Strong-style workout tracker (PWA). Full spec: see PLAN.md.

## Decisions
- Hosting: GitHub Pages, repo variant A (project page), repo name `workout-tracker` -> `base: '/workout-tracker/'`, URL `https://<user>.github.io/workout-tracker/`.
- Exercise images: not precached. Precache only app shell + seed JSON; images via Workbox runtime caching (CacheFirst).

## Rules
- UI language: German. Code and comments: English. Exercise names and instructions stay English on purpose (no translation); search understands German terms.
- Scope is closed after Phase 8: no TV mode, no native iOS app, no online sync.
- Mobile-first (390 px width), touch targets >= 44 px, dark mode default.
- Responsive for every screen: phone = bottom nav + single column; `md` and up = side nav, wider content, multi-column lists/detail layouts; `2xl` (TV, large screens) = larger base font. Check new screens at 390 px and at desktop width.
- Exercise library is a curated core list for regular gym and home training (`scripts/exercise-core.json`, ~200). Prefer too few over too many; the user creates missing ones as custom exercises. Change the list there, then run `npm run seed`.
- Local-first: all data in Dexie. No backend and no online sync (decided against it); moving data between devices is done with the export/import in Settings. Keep that export complete when adding new data types.
- Model-switch stop: before each phase / sub-task from PLAN.md section 7a, stop, name the recommended model and ask (AskUserQuestion: "Umgestellt, weiter" / "Mit aktuellem Modell weitermachen" / "Abbrechen"). Do not start without confirmation. At the end of each phase, name the recommended model for the next one.
- GitHub Pages: `base` and manifest scope/start_url/id on the repo path, `HashRouter`, assets only via `import.meta.env.BASE_URL`. Never commit personal data (`*.backup.json` in .gitignore).
- Stats are always computed from sets, never stored twice.
- Timers use timestamps (end time), never counting intervals.
- No rest timer after completing a set (removed on request); don't reintroduce it.
- Every stats function gets vitest unit tests.
- Do not copy Strong assets, logos or texts.
