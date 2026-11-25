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
  bytesLoaded?: number;
  bytesTotal?: number;
}

export class UploadCancelledError extends Error {
  constructor(message = 'Proses upload dibatalkan.') {
    super(message);
    this.name = 'UploadCancelledError';
  }
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
// ROBUST FETCH & XHR WITH EXPONENTIAL RETRY
// ==========================================
function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new UploadCancelledError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new UploadCancelledError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
  baseDelayMs = 1200
): Promise<Response> {
  let lastError: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (options.signal?.aborted) {
      throw new UploadCancelledError();
    }
    try {
      const res = await fetch(url, options);
      // Jika server terkena rate limit (429) atau transient server error (500, 502, 503, 504)
      if (res.status === 429 || (res.status >= 500 && res.status <= 504)) {
        if (attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 300;
          console.warn(`[fetchWithRetry] HTTP ${res.status} pada ${url}. Percobaan ulang (${attempt + 1}/${maxRetries}) dalam ${Math.round(delay)}ms...`);
          await sleepWithAbort(delay, options.signal ?? undefined);
          continue;
        }
      }
      return res;
    } catch (err: any) {
      if (err instanceof UploadCancelledError || err?.name === 'AbortError' || options.signal?.aborted) {
        throw new UploadCancelledError();
      }
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 300;
        console.warn(`[fetchWithRetry] Gangguan koneksi (${err?.message || 'timeout'}) pada ${url}. Mencoba ulang (${attempt + 1}/${maxRetries}) dalam ${Math.round(delay)}ms...`);
        await sleepWithAbort(delay, options.signal ?? undefined);
      }
    }
  }
  throw lastError || new Error(`Gagal menghubungi server setelah ${maxRetries} percobaan`);
}

interface XhrJsonResponse {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
}

function sendJsonXhr(
  url: string,
  bodyStr: string,
  onUploadProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal
): Promise<XhrJsonResponse> {
  if (signal?.aborted) return Promise.reject(new UploadCancelledError());

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.timeout = 90_000;

    const cleanup = () => {
      signal?.removeEventListener('abort', handleAbort);
    };

    const handleAbort = () => {
      xhr.abort();
    };

    signal?.addEventListener('abort', handleAbort, { once: true });

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        onUploadProgress?.(ev.loaded, ev.total);
      }
    };

    xhr.onload = () => {
      cleanup();
      let parsed: Record<string, unknown> = {};
      try {
        parsed = xhr.responseText ? (JSON.parse(xhr.responseText) as Record<string, unknown>) : {};
      } catch {
        parsed = {};
      }
      resolve({
        ok: xhr.status >= 200 && xhr.status < 300,
        status: xhr.status,
        data: parsed,
      });
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error('Koneksi jaringan terputus saat mengunggah foto'));
    };

    xhr.ontimeout = () => {
      cleanup();
      reject(new Error('Timeout jaringan saat mengunggah foto'));
    };

    xhr.onabort = () => {
      cleanup();
      reject(new UploadCancelledError());
    };

    xhr.send(bodyStr);
  });
}

async function xhrPostJsonWithRetry(
  url: string,
  payload: Record<string, unknown>,
  onUploadProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<XhrJsonResponse> {
  const bodyStr = JSON.stringify(payload);
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) throw new UploadCancelledError();

    try {
      const res = await sendJsonXhr(url, bodyStr, onUploadProgress, signal);
      if (res.status === 429 || (res.status >= 500 && res.status <= 504)) {
        if (attempt < maxRetries) {
          onUploadProgress?.(0, bodyStr.length);
          const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 300;
          console.warn(`[xhrPostJsonWithRetry] HTTP ${res.status} pada ${url}. Percobaan ulang (${attempt + 1}/${maxRetries}) dalam ${Math.round(delay)}ms...`);
          await sleepWithAbort(delay, signal);
          continue;
        }
      }
      return res;
    } catch (err: unknown) {
      if (err instanceof UploadCancelledError || signal?.aborted) {
        throw new UploadCancelledError();
      }
      lastError = err;
      if (attempt < maxRetries) {
        onUploadProgress?.(0, bodyStr.length);
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 300;
        const msg = err instanceof Error ? err.message : 'timeout';
        console.warn(`[xhrPostJsonWithRetry] Gangguan (${msg}) pada ${url}. Mencoba ulang (${attempt + 1}/${maxRetries}) dalam ${Math.round(delay)}ms...`);
        await sleepWithAbort(delay, signal);
      }
    }
  }

  throw lastError || new Error(`Gagal menghubungi server setelah ${maxRetries} percobaan`);
}

// ==========================================
// MAIN UPLOAD FUNCTION (PARALLEL POOL QUEUE)
// ==========================================

const UPLOAD_CONCURRENCY = 3;

function getMaxExistingPhotoNumber(photos: InspectionPhoto[]): number {
  let maxNum = 0;
  for (const p of photos) {
    if (!p.fileName) continue;
    const match = p.fileName.match(/^foto-(\d+)/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (Number.isFinite(num) && num > maxNum) maxNum = num;
    }
  }
  return maxNum;
}

export const uploadToDrive = async (
  session: InspectionSession & { photos: InspectionPhoto[] },
  _photos: InspectionPhoto[],
  onProgress?: ProgressCallback,
  onlyNewPhotos?: InspectionPhoto[] | null,
  signal?: AbortSignal
): Promise<{ success: true; folderId: string }> => {

  if (signal?.aborted) throw new UploadCancelledError();

  // Tentukan foto yang akan di-upload (Semua atau cuma yang baru)
  const rawPhotos = onlyNewPhotos ?? session.photos;
  const validPhotos = rawPhotos.filter((p) => !!p.driveFileId || !!p.dataUrl);
  const totalPhotos = validPhotos.length;

  let folderId = session.driveFolderId;

  // Selalu sinkronkan metadata (data-inspeksi.json) kecuali saat resume tengah-jalan upload foto
  const isResumingMidPhotos =
    !!folderId &&
    (session.uploadStatus === 'uploading_photos' || session.uploadStatus === 'partial_failed');

  try {
    // ── PHASE 1: Upload / Update Metadata JSON & Folder ──
    if (!isResumingMidPhotos) {
      onProgress?.({
        percentage: totalPhotos === 0 ? 30 : 5,
        loaded: 0,
        total: totalPhotos,
      });

      await db.inspection_sessions.update(session.id, {
        uploadStatus: 'uploading_meta',
        ...(folderId ? {} : { photosUploaded: 0 }),
      });

      const apiBase = getApiBaseUrl();
      const metaRes = await fetchWithRetry(`${apiBase}/api/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          existingFolderId: folderId ?? null,
          inspectionData: {
            id: session.id,
            clientName: session.clientName,
            objectType: session.objectType,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            tanggal_inspeksi: getTanggalInspeksi(session),
            sifat_pemeriksaan: getSifatPemeriksaan(session) ?? null,
            unitData: session.unitData,
            totalPhotos: session.photos.length,
            inspectorEmail: session.inspectorEmail ?? null,
          }
        }),
      }, 3, 1500);

      if (!metaRes.ok) {
        const errData = await metaRes.json().catch(() => ({}));
        throw new Error(errData?.error || `HTTP ${metaRes.status} saat sinkronisasi folder & metadata`);
      }

      const metaData = await metaRes.json();
      folderId = metaData.folderId;

      await db.inspection_sessions.update(session.id, {
        driveFolderId: folderId,
        uploadStatus: 'uploading_photos',
      });
    }

    if (signal?.aborted) throw new UploadCancelledError();

    // ── PHASE 2: Upload Foto (Parallel Pool + Byte-Level XHR Progress + Auto-Resume) ──
    const alreadyUploadedCount = validPhotos.filter((p) => !!p.driveFileId).length;
    const basePhotoNumber = Math.max(getMaxExistingPhotoNumber(session.photos), alreadyUploadedCount);

    const pendingItems = validPhotos
      .map((photo, index) => ({ photo, originalIndex: index }))
      .filter((item) => !item.photo.driveFileId && !!item.photo.dataUrl)
      .map((item, pendingIdx) => ({
        ...item,
        photoNumber: basePhotoNumber + pendingIdx + 1,
      }));

    let completedCount = alreadyUploadedCount;
    const inFlightFraction = new Map<string, number>();
    const inFlightBytes = new Map<string, { loaded: number; total: number }>();
    const totalPendingBytes = pendingItems.reduce((sum, item) => sum + item.photo.dataUrl.length, 0);
    let completedBytes = 0;
    let lastEmitAt = 0;
    let lastEmittedPct = -1;

    const emitPhotoProgress = (force = false) => {
      let inFlightSum = 0;
      for (const frac of inFlightFraction.values()) {
        inFlightSum += frac;
      }

      let activeBytes = 0;
      for (const b of inFlightBytes.values()) {
        activeBytes += b.loaded;
      }

      const effectiveDone = completedCount + inFlightSum;
      const pct = totalPhotos > 0
        ? Math.min(99, 5 + Math.round((effectiveDone / totalPhotos) * 94))
        : 95;

      const now = Date.now();
      if (!force && pct === lastEmittedPct && now - lastEmitAt < 120) {
        return;
      }
      lastEmitAt = now;
      lastEmittedPct = pct;

      onProgress?.({
        percentage: pct,
        loaded: completedCount,
        total: totalPhotos,
        bytesLoaded: completedBytes + activeBytes,
        bytesTotal: totalPendingBytes,
      });
    };

    emitPhotoProgress(true);

    if (pendingItems.length > 0) {
      const apiBase = getApiBaseUrl();
      let cursor = 0;
      let firstError: Error | null = null;

      const workerCount = Math.min(UPLOAD_CONCURRENCY, pendingItems.length);
      const workers = Array.from({ length: workerCount }, async () => {
        while (!firstError && !signal?.aborted) {
          const idx = cursor++;
          if (idx >= pendingItems.length) break;

          const { photo, originalIndex, photoNumber } = pendingItems[idx];

          try {
            inFlightFraction.set(photo.id, 0);
            const photoRes = await xhrPostJsonWithRetry(
              `${apiBase}/api/upload-photo`,
              {
                folderId,
                photoBase64: photo.dataUrl,
                photoIndex: originalIndex,
                photoNumber,
                photoUid: photo.id,
              },
              (loaded, total) => {
                if (total > 0) {
                  // 0%..88% untuk transfer jaringan, sisanya menunggu Drive commit
                  inFlightFraction.set(photo.id, Math.min(0.88, (loaded / total) * 0.88));
                  inFlightBytes.set(photo.id, { loaded, total });
                  emitPhotoProgress(false);
                }
              },
              signal,
              3,
              1000
            );

            if (!photoRes.ok) {
              const errMsg = typeof photoRes.data?.error === 'string' ? photoRes.data.error : '';
              throw new Error(errMsg || `Gagal upload foto ke-${originalIndex + 1}`);
            }

            const photoData = photoRes.data ?? {};
            const driveFileId = typeof photoData.fileId === 'string' ? photoData.fileId : '';
            const driveFileName = typeof photoData.fileName === 'string' ? photoData.fileName : undefined;
            if (driveFileId && photo.id) {
              await db.inspection_photos.update(photo.id, {
                driveFileId,
                fileName: driveFileName,
              });
            }

            inFlightFraction.delete(photo.id);
            inFlightBytes.delete(photo.id);
            completedBytes += photo.dataUrl.length;
            const doneCount = ++completedCount;
            await db.inspection_sessions.update(session.id, {
              photosUploaded: doneCount,
            });
            emitPhotoProgress(true);
          } catch (err: unknown) {
            inFlightFraction.delete(photo.id);
            inFlightBytes.delete(photo.id);
            if (!firstError) {
              firstError = err instanceof Error ? err : new Error(String(err));
            }
            break;
          }
        }
      });

      await Promise.all(workers);
      if (firstError) throw firstError;
      if (signal?.aborted) throw new UploadCancelledError();
    }

    // ── PHASE 3: Selesai Semua ──
    onProgress?.({
      percentage: 100,
      loaded: totalPhotos,
      total: totalPhotos,
      bytesLoaded: totalPendingBytes,
      bytesTotal: totalPendingBytes,
    });

    await db.inspection_sessions.update(session.id, {
      uploadStatus: 'fully_synced',
      status: 'synced',
      photosUploaded: totalPhotos,
      updatedAt: Date.now(), // ← trigger device lain untuk pull ulang
    });

    return { success: true, folderId: folderId! };

  } catch (err: any) {
    // Kalau gagal di tengah jalan atau dibatalkan, ubah status jadi partial_failed biar bisa di-resume nanti
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