// vite.config.ts
// FIXED: PWA plugin + workbox offline-first config

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // FIXED: vite-plugin-pwa aktif dengan workbox offline-first
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png', 'icons/*.svg'],
      // FIXED: manifest.json di-generate otomatis dari sini
      manifest: {
        name: 'Aksara Inspect',
        short_name: 'Aksara',
        description: 'Aplikasi inspeksi K3 offline-first untuk Ahli K3 di lapangan',
        theme_color: '#10B981',
        background_color: '#F7F8FA',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      // FIXED: workbox config untuk cache app shell + assets
      workbox: {
        // Cache app shell (HTML, JS, CSS)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // FIXED: navigateFallback agar app bisa dibuka offline
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // FIXED: runtime caching untuk Google Fonts & API calls
        runtimeCaching: [
          {
            // Cache Google Fonts
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Cache Google Drive API calls saat offline (fallback graceful)
            urlPattern: /^https:\/\/www\.googleapis\.com\/.*/i,
            handler: 'NetworkOnly',
            options: { cacheName: 'googleapis-cache' },
          },
          {
            // Cache semua asset statik
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
        // FIXED: Skip waiting agar SW langsung aktif setelah update
        skipWaiting: true,
        clientsClaim: true,
      },
      // FIXED: devOptions agar bisa test SW di development
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        // Chunking untuk performa lebih baik
        manualChunks: {
          vendor: ['react', 'react-dom'],
          dexie: ['dexie'],
          pdf: ['jspdf', 'jspdf-autotable'],
        },
      },
    },
  },
});