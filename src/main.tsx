import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { ensureSeeded } from './db/seed';
import './index.css';

const UPDATE_CHECK_MS = 60 * 60 * 1000;

// autoUpdate reloads the page as soon as a new version is installed. Browsers only look for a
// new version on a full start, and iOS mostly resumes the app from the background, so we also
// check whenever the app comes back to the foreground and once an hour.
registerSW({
  immediate: true,
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

ensureSeeded().catch((e) => console.error('Exercise seed failed', e));

// Ask the browser not to evict our IndexedDB under storage pressure (best effort, no prompt on iOS).
void navigator.storage?.persist?.().catch(() => false);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
