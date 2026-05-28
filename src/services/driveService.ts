// src/services/driveService.ts
// FIXED: Upload lewat serverless api/upload.ts pakai OAuth Refresh Token
// FIXED (PR fix): uploadToDrive sekarang punya parameter onlyNewPhotos
//   - saat create: kirim semua session.photos
//   - saat edit: kirim hanya foto baru (newPhotos) agar tidak duplikat di Drive
//   - api/upload.ts sudah handle lanjut penomoran dari countExistingPhotos

import type { InspectionSession, InspectionPhoto } from '../db/db';
import { getApiBaseUrl } from '../config';

export interface UploadProgress {
  current: number;
  total: number;
  fileName: string;
  phase: 'folder' | 'data' | 'photo';
}

type ProgressCallback = (progress: UploadProgress) => void;

// ==========================================
// TOKEN HELPERS
// ==========================================

export class TokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

export function saveToken(token: string, expiresInSeconds: number) {
  localStorage.setItem('google_token', token);
  localStorage.setItem(
    'google_token_expiry',
    String(Date.now() + expiresInSeconds * 1000)
  );
}

export function clearToken() {
  localStorage.removeItem('google_token');
  localStorage.removeItem('google_token_expiry');
  localStorage.removeItem('google_token_saved_at');
}

export function hasValidToken(): boolean {
  return !!localStorage.getItem('google_token');
}

export function getValidToken(): string {
  const token = localStorage.getItem('google_token');
  if (!token) throw new TokenExpiredError('Belum login Google.');
  return token;
}

export function isTokenExpiringSoon(_withinMinutes = 10): boolean {
  const expiryStr = localStorage.getItem('google_token_expiry');
  if (!expiryStr) return true;
  const expiry = parseInt(expiryStr, 10);
  return Date.now() > expiry - _withinMinutes * 60_000;
}

// ==========================================
// MAIN UPLOAD FUNCTION
// FIXED: Tambah parameter onlyNewPhotos (opsional)
//   - Kalau undefined/null → upload semua session.photos (create baru)
//   - Kalau diisi array dataUrl → upload hanya foto itu (edit, cegah duplikat)
// api/upload.ts sudah handle countExistingPhotos untuk lanjut penomoran
// ==========================================

export const uploadToDrive = async (
  session: InspectionSession & { photos: InspectionPhoto[] },
  _photos: InspectionPhoto[],
  onProgress?: ProgressCallback,
  // FIXED: Parameter baru — foto yang mau diupload ke Drive
  // Kalau null/undefined → semua session.photos (behavior lama untuk create)
  // Kalau diisi → hanya foto ini yang dikirim (untuk edit, cegah duplikat)
  onlyNewPhotos?: InspectionPhoto[] | null
): Promise<{ success: true; folderId: string }> => {

  // FIXED: Tentukan foto mana yang mau dikirim ke server
  const photosToUpload = onlyNewPhotos ?? session.photos;
  const totalPhotos = photosToUpload.length;
  const totalSteps = totalPhotos + 2;

  onProgress?.({
    current: 0,
    total: totalSteps,
    fileName: 'Menyiapkan upload...',
    phase: 'folder',
  });

  // Konversi ke format payload
  // Nama file sementara — api/upload.ts akan re-nomori dari countExistingPhotos
  const photosPayload = photosToUpload.map((photo, i) => ({
    name: `foto-temp-${String(i + 1).padStart(3, '0')}.jpg`,
    dataUrl: photo.dataUrl,
  }));

  onProgress?.({
    current: 1,
    total: totalSteps,
    fileName: 'data-inspeksi.json',
    phase: 'data',
  });

  const apiBase = getApiBaseUrl();
  const response = await fetch(`${apiBase}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session: {
        id: session.id,
        clientName: session.clientName,
        objectType: session.objectType,
        createdAt: new Date(session.createdAt).toISOString(),
        updatedAt: session.updatedAt
          ? new Date(session.updatedAt).toISOString()
          : null,
        unitData: session.unitData,
        inspectorEmail: session.inspectorEmail ?? null,
      },
      photos: photosPayload,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error || `Upload gagal: HTTP ${response.status}`);
  }

  const result = await response.json();

  onProgress?.({
    current: totalSteps,
    total: totalSteps,
    fileName: 'Selesai',
    phase: 'photo',
  });

  return { success: true, folderId: result.folderId ?? '' };
};

// Dipertahankan untuk backward compat
export async function uploadTextFile(
  _token: string,
  _name: string,
  _content: string,
  _parentId: string
): Promise<void> {
  console.warn('[driveService] uploadTextFile dipanggil langsung — seharusnya lewat api/sync-templates');
}