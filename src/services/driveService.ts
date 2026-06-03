// src/services/driveService.ts
// VERSI BARU: Smart Append Orchestrator (Antrean Upload & Anti-413)
// - Upload JSON ke api/upload (buat folder)
// - Upload foto SATU PER SATU ke api/upload-photo (cegah limit Vercel)
// - Bisa melanjutkan upload yang terputus (resume)

import { db, type InspectionSession, type InspectionPhoto } from '../db/db';
import { getApiBaseUrl } from '../config';

export interface UploadProgress {
  current: number;
  total: number;
  fileName: string;
  phase: 'folder' | 'data' | 'photo';
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
        current: 0,
        total: totalSteps,
        fileName: 'Menyiapkan folder...',
        phase: 'folder',
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
      
      onProgress?.({
        current: i + 1,
        total: totalSteps,
        fileName: `Foto ${i + 1} dari ${totalPhotos}...`,
        phase: 'photo',
      });

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

      // Catat progress di DB lokal biar aman kalau internet mendadak putus
      await db.inspection_sessions.update(session.id, {
        photosUploaded: i + 1
      });
    }

    // ── PHASE 3: Selesai Semua ──
    onProgress?.({
      current: totalSteps,
      total: totalSteps,
      fileName: 'Selesai!',
      phase: 'photo',
    });

    await db.inspection_sessions.update(session.id, {
      uploadStatus: 'fully_synced',
      status: 'synced' // ubah status jadi synced
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

// Dipertahankan untuk backward compat
export async function uploadTextFile(
  _token: string,
  _name: string,
  _content: string,
  _parentId: string
): Promise<void> {
  console.warn('[driveService] uploadTextFile dipanggil langsung — seharusnya lewat api/sync-templates');
}