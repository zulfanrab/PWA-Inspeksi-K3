# AI Context - PWA Inspeksi K3

Project ini adalah aplikasi PWA React + TypeScript untuk manajemen inspeksi K3 (Kesehatan dan Keselamatan Kerja) PT Aksara Riksa Perdana.

## Ringkasan cepat
- Framework: React + TypeScript + Vite
- Penyimpanan offline: Dexie.js (IndexedDB)
- Styling: Tailwind CSS
- Integrasi: Google Drive API (OAuth 2.0)
- Fokus: inspeksi lapangan, riwayat data, sinkronisasi draft, dan penggunaan offline.

## Struktur utama
- package.json: dependensi dan script project
- vite.config.ts: konfigurasi Vite
- src/App.tsx: logika utama aplikasi dan alur form
- src/config.ts: konfigurasi aplikasi
- src/main.tsx: entry point React
- src/components/: komponen UI utama
  - AdminPanel.tsx
  - ClientPicker.tsx
  - FormView.tsx
  - GoogleAuth.tsx
  - Header.tsx
  - HistoryView.tsx
  - InspectionForm.tsx
  - SyncHub.tsx
- src/db/db.ts: skema Dexie.js dan repository pattern
- src/services/driveService.ts: integrasi Google Drive API
- src/utils/pdfExport.ts: export PDF
- public/manifest.json: manifest PWA
- public/sw.js: service worker
- dev-dist/: build artifact / PWA support

## Fitur yang sudah terlihat dari kode
- Offline-first storage di browser
- Riwayat inspeksi yang bisa diedit
- Sinkronisasi draft ke Google Drive
- UI responsif untuk penggunaan di smartphone

## Cara paling efektif untuk membagikan ke AI lain
1. Kirim seluruh folder project ini sebagai ZIP, atau bagikan repo Git.
2. Sertakan file ini (AI_CONTEXT.md) sebagai penjelasan awal.
3. Jika AI hanya bisa membaca teks, kirim juga:
   - package.json
   - README.md
   - src/App.tsx
   - src/db/db.ts
   - src/services/driveService.ts
   - src/components/*

## Prompt singkat untuk AI lain
"Ini adalah project React + TypeScript PWA inspeksi K3. Tolong baca seluruh folder ini, fokus pada alur inspeksi, penyimpanan offline, dan sinkronisasi ke Google Drive. Jelaskan struktur, bug yang mungkin ada, dan rekomendasi perbaikan."
