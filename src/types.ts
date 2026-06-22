// src/types.ts
// Tipe data inspeksi — dipakai frontend & referensi payload upload Drive

export type SifatPemeriksaan = 'Baru' | 'Berkala';

export interface UnitData {
  namaUnit?: string;
  nomorSeri?: string;
  lokasiUnit?: string;
  catatan?: string;
  /** Tanggal inspeksi dilakukan (YYYY-MM-DD) — dipakai folder Drive & filter riwayat */
  tanggal_inspeksi?: string;
  /** Baru = uji pertama kali; Berkala = uji ulang */
  sifat_pemeriksaan?: SifatPemeriksaan;
  [key: string]: string | undefined;
}

export interface InspectionSession {
  id: string;
  clientName: string;
  objectType: string;
  unitData: UnitData;
  status: 'draft' | 'synced';
  createdAt: number;
  updatedAt?: number;
  templateClientId?: string;
  templateUnitId?: string;
  inspectorEmail?: string;
  driveFolderId?: string;
  drivePhotoIds?: string[];
  uploadStatus?: string;
  photosUploaded?: number;
  /** Duplikat top-level untuk payload upload (mirror unitData) */
  tanggal_inspeksi?: string;
  sifat_pemeriksaan?: SifatPemeriksaan;
}

/** Ambil tanggal inspeksi YYYY-MM-DD dari session (top-level atau unitData) */
export function getTanggalInspeksi(session: {
  tanggal_inspeksi?: string;
  unitData?: UnitData;
  createdAt?: number;
}): string {
  const raw =
    session.tanggal_inspeksi?.trim() ||
    session.unitData?.tanggal_inspeksi?.trim();
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (session.createdAt) {
    return new Date(session.createdAt).toLocaleDateString('sv-SE', {
      timeZone: 'Asia/Jakarta',
    });
  }
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

/** Ambil sifat pemeriksaan dari session */
export function getSifatPemeriksaan(session: {
  sifat_pemeriksaan?: SifatPemeriksaan;
  unitData?: UnitData;
}): SifatPemeriksaan | undefined {
  return session.sifat_pemeriksaan || session.unitData?.sifat_pemeriksaan;
}

/** Ekstrak tahun dari tanggal inspeksi */
export function getInspectionYear(session: {
  tanggal_inspeksi?: string;
  unitData?: UnitData;
  createdAt?: number;
}): string {
  return getTanggalInspeksi(session).slice(0, 4);
}
