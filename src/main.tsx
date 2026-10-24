import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { getActiveWorkout } from './db/activeWorkout';
import { ensureSeeded } from './db/seed';
import { markUpdateReady, setApplyUpdate } from './lib/update';
import './index.css';

const UPDATE_CHECK_MS = 60 * 60 * 1000;
const COLD_START_WINDOW_MS = 10_000;
const startedAt = Date.now();

// Browsers only look for a new version on a full start and iOS mostly resumes the app from the
// background, so we also check whenever the app returns to the foreground and once an hour.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    markUpdateReady();
    // Fresh start and no workout running: nothing to interrupt, so update right away.
    if (Date.now() - startedAt < COLD_START_WINDOW_MS) {
      void getActiveWorkout().then((w) => {
        if (!w) void updateSW(true);
      });
    }
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => {
      if (navigator.onLine) void registration.update().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    setInterval(check, UPDATE_CHECK_MS);
  },
});
setApplyUpdate(() => void updateSW(true));

ensureSeeded().catch((e) => console.error('Exercise seed failed', e));

// Ask the browser not to evict our IndexedDB under storage pressure (best effort, no prompt on iOS).
void navigator.storage?.persist?.().catch(() => false);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
