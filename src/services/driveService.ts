// src/services/driveService.ts
// FIXED: Upload tidak lagi langsung ke Google Drive API
// FIXED: Semua upload lewat serverless api/upload.ts pakai Service Account
// FIXED: Token logic disederhanakan — token hanya untuk identitas user, bukan Drive access
// FIXED: Progress indicator tetap ada, dihitung dari jumlah foto

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
// FIXED: Token sekarang hanya untuk identitas (nama + email)
// Tidak ada Drive scope — tidak perlu validasi expiry untuk Drive
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

// FIXED: hasValidToken sekarang hanya cek apakah user sudah login (ada token)
// Tidak lagi dipakai untuk Drive access
export function hasValidToken(): boolean {
  return !!localStorage.getItem('google_token');
}

// FIXED: getValidToken — masih ada untuk kompatibilitas komponen lain
// Tapi tidak lagi wajib untuk upload (upload pakai Service Account)
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
// FIXED: Kirim ke api/upload.ts, bukan langsung ke Google Drive
// ==========================================

export const uploadToDrive = async (
  session: InspectionSession & { photos: InspectionPhoto[] },
  _photos: InspectionPhoto[],
  onProgress?: ProgressCallback
): Promise<{ success: true; folderId: string }> => {

  const totalPhotos = session.photos.length;
  const totalSteps = totalPhotos + 2; // folder setup + data json + setiap foto

  // Step 1: Persiapan
  onProgress?.({
    current: 0,
    total: totalSteps,
    fileName: 'Menyiapkan upload...',
    phase: 'folder',
  });

  // Step 2: Konversi foto ke format yang bisa dikirim ke server
  const photosPayload = session.photos.map((photo, i) => ({
    name: `foto-${String(i + 1).padStart(3, '0')}.jpg`,
    dataUrl: photo.dataUrl,
  }));

  onProgress?.({
    current: 1,
    total: totalSteps,
    fileName: 'data-inspeksi.json',
    phase: 'data',
  });

  // Step 3: Kirim ke serverless api/upload.ts
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

  // Update progress ke selesai
  onProgress?.({
    current: totalSteps,
    total: totalSteps,
    fileName: 'Selesai',
    phase: 'photo',
  });

  return { success: true, folderId: result.folderId ?? '' };
};

// FIXED: uploadTextFile tidak lagi dipakai langsung dari frontend
// Dipertahankan untuk backward compat kalau ada import lain
export async function uploadTextFile(
  _token: string,
  _name: string,
  _content: string,
  _parentId: string
): Promise<void> {
  console.warn('[driveService] uploadTextFile dipanggil langsung — seharusnya lewat api/sync-templates');
}