// src/config/changelog.ts
// Catatan pembaruan aplikasi (What's New) yang ditampilkan otomatis kepada pengguna
// saat pertama kali membuka versi terbaru.

export type UpdateTag = 'Baru' | 'Lebih Cepat' | 'Perbaikan';

export interface ChangelogItem {
  icon: string;
  title: string;
  description: string;
  tag: UpdateTag;
}

export interface ReleaseNote {
  version: string;
  date: string;
  title: string;
  summary: string;
  highlights: ChangelogItem[];
}

export const APP_VERSION = '1.3.0';
export const LAST_SEEN_VERSION_KEY = 'aksara_last_seen_version';

export const CHANGELOG: ReleaseNote[] = [
  {
    version: '1.3.0',
    date: '27 November 2026',
    title: 'Modul Laporan IPP v5, Lampiran Multi-Halaman & Sync Laporan Lintas Perangkat',
    summary:
      'Wizard 4 langkah mobile-first untuk Instalasi Penyalur Petir, Master Ahli K3 & SKP Perusahaan, gabung lampiran PDF multi-halaman otomatis, AI Gemini 3.8 Flash, serta sinkronisasi daftar laporan antar Desktop & HP.',
    highlights: [
      {
        icon: '⚡',
        title: 'Wizard Laporan Penyalur Petir (IPP) 4 Langkah',
        description:
          'Kalkulator Sigmat otomatis, multi-titik tahanan pembumian, auto-mirror ke checklist A-E & kontinuitas, serta ekspor Word (.docx) & PDF identik ukuran Folio.',
        tag: 'Baru',
      },
      {
        icon: '📑',
        title: 'Master SKP & Lampiran PDF Multi-Halaman',
        description:
          'Simpan SKP PJK3 Perusahaan dan SKP Ahli K3 di Panel Admin, plus unggah lampiran PDF/foto multi-halaman yang otomatis digabung ke halaman Folio laporan.',
        tag: 'Baru',
      },
      {
        icon: '☁️',
        title: 'Sinkronisasi Daftar Laporan Desktop ↔ HP',
        description:
          'Laporan yang dibuat atau diekspor di Desktop otomatis disinkronkan ke Google Drive sehingga dapat dibuka, diedit, atau diunduh langsung dari HP.',
        tag: 'Baru',
      },
      {
        icon: '✨',
        title: 'Upgrade AI ke Gemini 3.8 Flash',
        description:
          'OCR layar alat ukur Earth Tester, sortir & caption foto otomatis, poles narasi K3, dan Pre-Flight QC kini berjalan menggunakan model Gemini 3.8 Flash.',
        tag: 'Perbaikan',
      },
    ],
  },
  {
    version: '1.2.1',
    date: '26 November 2026',
    title: 'Tap Zoom Kamera Lebih Mulus & Pembaruan PWA iPhone',
    summary:
      'Penyempurnaan animasi tap zoom kamera agar mulus tanpa patah, deteksi lensa 0.5x Ultra-Wide yang lebih akurat, serta sinkronisasi update otomatis di iOS Safari PWA.',
    highlights: [
      {
        icon: '🎥',
        title: 'Animasi Tap Zoom Mulus Tanpa Patah',
        description:
          'Menghilangkan bentrok antara zoom hardware dan digital serta menambahkan interpolasi halus saat berpindah preset 0.5x, 1x, 2x, 3x, dan 5x maupun pinch zoom.',
        tag: 'Perbaikan',
      },
      {
        icon: '📐',
        title: 'Deteksi Lensa 0.5x Ultra-Wide Diperkuat',
        description:
          'Mendukung deteksi label kamera Bahasa Indonesia & Inggris di iPhone maupun multi-kamera belakang di Android dengan jeda pelepasan sensor yang aman.',
        tag: 'Perbaikan',
      },
      {
        icon: '📲',
        title: 'Pembaruan Otomatis iPhone PWA Lebih Cepat',
        description:
          'Menambahkan header cache Service Worker serta deteksi controllerchange agar iPhone PWA tidak tertinggal di versi cache lama.',
        tag: 'Perbaikan',
      },
    ],
  },
  {
    version: '1.2.0',
    date: '26 November 2026',
    title: 'Upload Latar Belakang & Perbaikan Tampilan',
    summary:
      'Upgrade besar ke Global Upload Queue non-blocking serta perbaikan tampilan Kamera, Galeri Riwayat, dan Tanggal Inspeksi di layar mobile.',
    highlights: [
      {
        icon: '🫧',
        title: 'Global Upload Queue & Widget Minimize/Expand',
        description:
          'Unggahan kini berjalan di latar belakang dengan persentase byte-progress real-time (XHR). Widget mengambang bisa diperkecil (mode mini) atau diperbesar untuk melihat rincian antrean.',
        tag: 'Baru',
      },
      {
        icon: '🚀',
        title: 'Unggah Foto 3x Lebih Cepat',
        description:
          'Foto inspeksi diunggah secara paralel (3 foto sekaligus) dengan penghematan proses di server Google Drive sehingga jauh lebih cepat.',
        tag: 'Lebih Cepat',
      },
      {
        icon: '🖼️',
        title: 'Pilih Foto Galeri Tanpa Layar Terblokir',
        description:
          'Overlay layar penuh saat memproses foto galeri dihilangkan dan diganti indikator progres ringkas langsung di form sehingga aplikasi tetap bisa digunakan.',
        tag: 'Perbaikan',
      },
      {
        icon: '📱',
        title: 'Kamera Tap Zoom, Lensa 0.5x & Perbaikan UI',
        description:
          'Zoom kamera kini memakai tombol tap cepat (0.5x jika didukung perangkat, 1x, 2x, 3x, 5x), perbaikan tampilan kamera & galeri di atas header, kotak tanggal form, serta tampilan Admin Panel desktop.',
        tag: 'Perbaikan',
      },
    ],
  },
];

export const LATEST_RELEASE: ReleaseNote = CHANGELOG[0];
