// src/services/driveService.ts
// VERSI BARU: Smart Append Orchestrator (Antrean Upload & Anti-413)
// - Upload JSON ke api/upload (buat folder)
// - Upload foto SATU PER SATU ke api/upload-photo (cegah limit Vercel)
// - Bisa melanjutkan upload yang terputus (resume)

import { db, type InspectionSession, type InspectionPhoto } from '../db/db';
import { getTanggalInspeksi, getSifatPemeriksaan } from '../types';
import { getApiBaseUrl } from '../config';

export interface UploadProgress {
  percentage: number;
  loaded: number;
  total: number;
}

type ProgressCallback = (progress: UploadProgress) => void;

// ==========================================
// TOKEN HELPERS (Dipertahankan)
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
// SILENT REFRESH
// ==========================================
export function trySilentRefresh(clientId: string, redirectUri: string): void {
  // Cek dulu apakah token masih valid — kalau masih aman, skip
  const expiryStr = localStorage.getItem('google_token_expiry');
  if (expiryStr) {
    const expiry = parseInt(expiryStr, 10);
    // Kalau masih lebih dari 5 menit, skip refresh
    if (Date.now() < expiry - 5 * 60_000) return;
  }

  const silentUrl = [
    'https://accounts.google.com/o/oauth2/v2/auth',
    `?client_id=${clientId}`,
    `&redirect_uri=${redirectUri}`,
    `&response_type=token`,
    `&scope=openid%20email%20profile`,
    `&prompt=none`,
  ].join('');

  const popup = window.open(silentUrl, '_blank', 'width=1,height=1,left=-1000,top=-1000');
  if (!popup) return;

  const timer = setInterval(() => {
    try {
      const hash = popup.location.hash;
      if (hash.includes('access_token')) {
        const params = new URLSearchParams(hash.substring(1));
        const token = params.get('access_token');
        const expiresIn = parseInt(params.get('expires_in') || '3600', 10);
        if (token) saveToken(token, expiresIn);
        clearInterval(timer);
        popup.close();
      }
      if (popup.closed) clearInterval(timer);
    } catch {
      // Cross-origin — belum redirect balik, tunggu
    }
  }, 500);

  // Timeout 15 detik — kalau gagal, tutup popup
  setTimeout(() => {
    clearInterval(timer);
    if (!popup.closed) popup.close();
  }, 15000);
}

// ==========================================
// MAIN UPLOAD FUNCTION (SEQUENTIAL QUEUE)
// ==========================================

export const uploadToDrive = async (
  session: InspectionSession & { photos: InspectionPhoto[] },
  _photos: InspectionPhoto[],
  onProgress?: ProgressCallback,
  onlyNewPhotos?: InspectionPhoto[] | null
): Promise<{ success: true; folderId: string }> => {

  // Tentukan foto yang akan di-upload (Semua atau cuma yang baru)
  const photosToUpload = onlyNewPhotos ?? session.photos;
  const totalPhotos = photosToUpload.length;
  const totalSteps = totalPhotos + 1; // 1 step buat JSON/Folder, sisanya foto

  let folderId = session.driveFolderId;

  try {
    // ── PHASE 1: Upload JSON & Bikin Folder ──
    if (!folderId) {
      onProgress?.({
        percentage: 0,
        loaded: 0,
        total: totalSteps,
      });

      await db.inspection_sessions.update(session.id, {
        uploadStatus: 'uploading_meta',
        photosUploaded: 0
      });

      const apiBase = getApiBaseUrl();
      const metaRes = await fetch(`${apiBase}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          existingFolderId: session.driveFolderId ?? null,
          inspectionData: {
            id: session.id,
            clientName: session.clientName,
            objectType: session.objectType,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            tanggal_inspeksi: getTanggalInspeksi(session),
            sifat_pemeriksaan: getSifatPemeriksaan(session) ?? null,
            unitData: session.unitData,
            totalPhotos: totalPhotos,
            inspectorEmail: session.inspectorEmail ?? null,
          }
        }),
      });

      if (!metaRes.ok) {
        const errData = await metaRes.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP ${metaRes.status} saat bikin folder`);
      }

      const metaData = await metaRes.json();
      folderId = metaData.folderId;

      await db.inspection_sessions.update(session.id, {
        driveFolderId: folderId,
        uploadStatus: 'uploading_photos'
      });
    }

    // ── PHASE 2: Upload Foto (Antrean Satu per Satu) ──
    // Kalau sebelumnya gagal di tengah jalan (partial_failed), kita lanjutin dari index terakhir
    const startIdx = session.uploadStatus === 'partial_failed' ? (session.photosUploaded || 0) : 0;

for (let i = startIdx; i < totalPhotos; i++) {
  const photo = photosToUpload[i];
  
  // Panggil progress SEBELUM fetch (tapi belum di-render)
  onProgress?.({
    percentage: Math.ceil(((i + 1) / totalPhotos) * 100),
    loaded: i,
    total: totalPhotos,
  });

  // KUNCI FIX: Kasih React time untuk render
  await new Promise(resolve => setTimeout(resolve, 10));

  const apiBase = getApiBaseUrl();
  const photoRes = await fetch(`${apiBase}/api/upload-photo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folderId: folderId,
      photoBase64: photo.dataUrl,
      photoIndex: i
    }),
  });

  if (!photoRes.ok) {
    const errData = await photoRes.json().catch(() => ({}));
    throw new Error(errData?.error || `Gagal upload foto ke-${i + 1}`);
  }

  const photoData = await photoRes.json().catch(() => ({}));
  if (photoData.fileId && photo.id) {
    await db.inspection_photos.update(photo.id, {
      driveFileId: photoData.fileId,
      fileName: photoData.fileName,
    });
  }

  await db.inspection_sessions.update(session.id, {
    photosUploaded: i + 1
  });

  // Panggil progress SETELAH foto berhasil
  onProgress?.({
    percentage: Math.round(((i + 1) / totalPhotos) * 100),
    loaded: i + 1,
    total: totalPhotos,
  });

// LAGI: Kasih React time untuk render
  await new Promise(resolve => setTimeout(resolve, 10));
}

    // ── PHASE 3: Selesai Semua ──
    onProgress?.({
      percentage: 100,
      loaded: totalSteps,
      total: totalSteps,
    });

    await db.inspection_sessions.update(session.id, {
      uploadStatus: 'fully_synced',
      status: 'synced',
      updatedAt: Date.now(), // ← trigger device lain untuk pull ulang
    });

    return { success: true, folderId: folderId! };

  } catch (err: any) {
    // Kalau gagal di tengah jalan, ubah status jadi partial_failed biar bisa di-resume nanti
    console.error('[driveService] Error:', err);
    await db.inspection_sessions.update(session.id, {
      uploadStatus: 'partial_failed'
    });
    throw err;
  }
};

export async function deletePhotoFromDrive(
  driveFileId: string,
  userEmail: string
): Promise<void> {
  const apiBase = getApiBaseUrl();
  const res = await fetch(`${apiBase}/api/delete-photo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileId: driveFileId, userEmail }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || 'Gagal hapus foto dari Drive');
  }
}

// Dipertahankan untuk backward compat
export async function uploadTextFile(
  _token: string,
  _name: string,
  _content: string,
  _parentId: string
): Promise<void> {
  console.warn('[driveService] uploadTextFile dipanggil langsung — seharusnya lewat api/sync-templates');
}