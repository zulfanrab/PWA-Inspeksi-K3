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

export const APP_VERSION = '1.2.0';
export const LAST_SEEN_VERSION_KEY = 'aksara_last_seen_version';

export const CHANGELOG: ReleaseNote[] = [
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
        title: 'Perbaikan Kamera, Galeri Riwayat & Tanggal Form',
        description:
          'Memperbaiki tombol atas kamera & galeri riwayat yang sempat tertutup header di mobile/iOS PWA, serta merapikan kotak Tanggal Inspeksi agar tidak keluar dari kartu.',
        tag: 'Perbaikan',
      },
    ],
  },
];

export const LATEST_RELEASE: ReleaseNote = CHANGELOG[0];
