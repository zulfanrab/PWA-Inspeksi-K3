# Aksara Inspect - PWA Inspeksi K3

Aplikasi PWA (Progressive Web App) untuk manajemen data inspeksi K3 (Kesehatan dan Keselamatan Kerja) PT Aksara Riksa Perdana.

## Tech Stack
- **Framework:** React + TypeScript + Vite
- **Storage:** Dexie.js (IndexedDB) untuk penyimpanan offline
- **Styling:** Tailwind CSS
- **Integration:** Google Drive API (OAuth 2.0)

## Fitur
- **Offline First:** Data tersimpan lokal di browser (IndexedDB).
- **History Management:** Riwayat inspeksi yang bisa diedit (CRUD).
- **Sync Hub:** Sinkronisasi draft ke Google Drive (Text report + Photos).
- **Responsive UI:** Dioptimalkan untuk penggunaan lapangan di smartphone.

## Project Structure
- `src/db/db.ts`: Skema database Dexie.js & Repository pattern.
- `src/App.tsx`: Main logic, form handling, dan state management.
- `src/services/driveService.ts`: Integrasi Google Drive API & upload logic.
- `src/components/`: UI components.

## Getting Started
1. **Clone repository ini.**
2. **Install dependencies:**
   ```bash
   npm install