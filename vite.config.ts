import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

const BASE = '/workout-tracker/';

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    // Shown in the app so you can see which deploy is running (commit on CI, "dev" locally).
    __APP_BUILD__: JSON.stringify(
      `${process.env.GITHUB_SHA?.slice(0, 7) ?? 'dev'} · ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })}`,
    ),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt': a new version waits until the app activates it (see src/lib/update.ts).
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        id: BASE,
        name: 'Workout Tracker',
        short_name: 'Workout',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b0b0f',
        theme_color: '#0b0b0f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + seed JSON are precached; exercise images are not (see CLAUDE.md).
        globPatterns: ['**/*.{js,css,html,json,png,svg,ico,woff2}'],
        // Splash images are only fetched by iOS at launch, never by the app itself.
        globIgnores: ['**/exercises/**', '**/illustrations/**', '**/splash/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.includes('/exercises/') || url.pathname.includes('/illustrations/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'exercise-images',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
});
