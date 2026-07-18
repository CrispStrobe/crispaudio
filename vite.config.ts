import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const host = process.env.TAURI_DEV_HOST;
const isTauri = !!host || !!process.env.TAURI_ENV_PLATFORM;
// GitHub Pages serves under a repo subpath (/crispaudio/); set PAGES_BASE for
// that build so assets, the service worker, and the manifest all resolve under
// it. Vercel (root domain) uses the default '/'.
const base = process.env.PAGES_BASE || '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    ...(!isTauri ? [VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.github\.com\/.*/i,
            handler: 'NetworkFirst',
            options: { cacheName: 'github-api', expiration: { maxEntries: 5, maxAgeSeconds: 3600 } },
          },
        ],
      },
      // Generated so start_url/scope/icons follow `base` — works on both the
      // root (Vercel) and the /crispaudio/ subpath (GitHub Pages). Icon paths
      // are relative so they resolve against the manifest's own URL.
      manifest: {
        name: 'CrispAudio',
        short_name: 'CrispAudio',
        description: 'Cross-platform audio workstation: SFX synthesis, voice effects, timeline editor',
        display: 'standalone',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: 'icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
    })] : []),
  ],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 5174 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/i18next') || id.includes('node_modules/react-i18next')) {
            return 'vendor-i18n';
          }
          if (id.includes('node_modules/zustand') || id.includes('node_modules/immer') || id.includes('node_modules/zundo')) {
            return 'vendor-state';
          }
        },
      },
    },
  },
});
