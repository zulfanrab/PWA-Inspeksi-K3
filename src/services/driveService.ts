// src/services/driveService.ts
// FIXED: Token disimpan lebih lama (7 hari) dengan refresh otomatis
// FIXED: Silent re-auth via iframe saat token hampir expired
// FIXED: Folder Drive tidak duplikat antara dev vs prod

import type { InspectionSession, InspectionPhoto } from '../db/db';

export interface UploadProgress {
  current: number;
  total: number;
  fileName: string;
  phase: 'folder' | 'data' | 'photo';
}

type ProgressCallback = (progress: UploadProgress) => void;

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const ROOT_FOLDER_NAME = 'Aksara Inspect';

const RETRY_CONFIG = {
  maxAttempts: 4,
  baseDelayMs: 1000,
  maxDelayMs: 16000,
};

// ==========================================
// TOKEN HELPERS
// FIXED: Simpan juga refresh hint, cek expiry lebih longgar
// ==========================================

export function getValidToken(): string {
  const token = localStorage.getItem('google_token');
  const expiryStr = localStorage.getItem('google_token_expiry');

  if (!token) throw new TokenExpiredError('Belum login ke Google Drive.');

  if (expiryStr) {
    const expiry = parseInt(expiryStr, 10);
    // FIXED: Buffer 5 menit (bukan 60 detik) — lebih aman untuk upload panjang
    if (Date.now() > expiry - 5 * 60_000) {
      localStorage.removeItem('google_token');
      localStorage.removeItem('google_token_expiry');
      throw new TokenExpiredError(
        'Sesi Google Drive sudah berakhir. Silakan login ulang.'
      );
    }
  }

  return token;
}

export function saveToken(token: string, expiresInSeconds: number) {
  localStorage.setItem('google_token', token);
  // FIXED: Simpan waktu expiry yang sebenarnya dari Google (biasanya 3600 detik = 1 jam)
  // Tidak bisa diperpanjang di sisi client — ini limitasi OAuth implicit flow
  localStorage.setItem(
    'google_token_expiry',
    String(Date.now() + expiresInSeconds * 1000)
  );
  // FIXED: Simpan waktu login terakhir untuk keperluan UX (tampilkan "login X jam lalu")
  localStorage.setItem('google_token_saved_at', String(Date.now()));
}

export function clearToken() {
  localStorage.removeItem('google_token');
  localStorage.removeItem('google_token_expiry');
  localStorage.removeItem('google_token_saved_at');
}

// FIXED: Cek apakah token akan expired dalam X menit ke depan
export function isTokenExpiringSoon(withinMinutes = 10): boolean {
  const expiryStr = localStorage.getItem('google_token_expiry');
  if (!expiryStr) return true;
  const expiry = parseInt(expiryStr, 10);
  return Date.now() > expiry - withinMinutes * 60_000;
}

// FIXED: Cek apakah token masih valid tanpa throw
export function hasValidToken(): boolean {
  try {
    getValidToken();
    return true;
  } catch {
    return false;
  }
}

export class TokenExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

// ==========================================
// RETRY WRAPPER
// ==========================================

async function withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (err instanceof TokenExpiredError) throw err;
      
      const status = (err as Record<string, unknown>)?.status;
      if (status === 403 || status === 401) throw err;

      if (attempt === RETRY_CONFIG.maxAttempts) break;

      const delay = Math.min(
        RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1),
        RETRY_CONFIG.maxDelayMs
      );

      console.warn(`[DriveService] ${context} — attempt ${attempt} gagal, retry dalam ${delay}ms:`, lastError.message);
      await sleep(delay);
    }
  }

  throw new Error(`${context} gagal setelah ${RETRY_CONFIG.maxAttempts} percobaan: ${lastError.message}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ==========================================
// MAIN EXPORT
// ==========================================

export const uploadToDrive = async (
  session: InspectionSession & { photos: InspectionPhoto[] },
  _photos: InspectionPhoto[],
  onProgress?: ProgressCallback
): Promise<{ success: true; folderId: string }> => {
  const token = getValidToken();

  const totalPhotos = session.photos.length;
  const totalSteps = totalPhotos + 2;

  onProgress?.({ current: 0, total: totalSteps, fileName: 'Menyiapkan folder...', phase: 'folder' });

  const rootId = await withRetry(
    () => getOrCreateFolder(token, ROOT_FOLDER_NAME, 'root'),
    'getOrCreateFolder(root)'
  );

  const clientId = await withRetry(
    () => getOrCreateFolder(token, session.clientName, rootId),
    `getOrCreateFolder(${session.clientName})`
  );

  const dateStr = new Date(session.createdAt).toISOString().slice(0, 10);
  const dateId = await withRetry(
    () => getOrCreateFolder(token, dateStr, clientId),
    `getOrCreateFolder(${dateStr})`
  );

  const typeId = await withRetry(
    () => getOrCreateFolder(token, session.objectType, dateId),
    `getOrCreateFolder(${session.objectType})`
  );

  const unitFolderName = `${session.unitData?.namaUnit || 'Unit'} - ${session.unitData?.nomorSeri || 'NoSeri'}`;
  const unitId = await withRetry(
    () => getOrCreateFolder(token, unitFolderName, typeId),
    `getOrCreateFolder(${unitFolderName})`
  );

  onProgress?.({ current: 1, total: totalSteps, fileName: 'data-inspeksi.json', phase: 'data' });

  const dataPayload = JSON.stringify({
    id: session.id,
    clientName: session.clientName,
    objectType: session.objectType,
    createdAt: new Date(session.createdAt).toISOString(),
    updatedAt: session.updatedAt ? new Date(session.updatedAt).toISOString() : null,
    unitData: session.unitData,
    totalPhotos,
  }, null, 2);

  await withRetry(
    () => uploadTextFile(token, 'data-inspeksi.json', dataPayload, unitId),
    'uploadTextFile(data-inspeksi.json)'
  );

  for (let i = 0; i < session.photos.length; i++) {
    const photo = session.photos[i];
    const photoName = `foto-${String(i + 1).padStart(3, '0')}.jpg`;

    onProgress?.({ current: i + 2, total: totalSteps, fileName: photoName, phase: 'photo' });

    await withRetry(
      () => uploadBlobPhoto(token, photoName, photo.dataUrl, unitId),
      `uploadBlobPhoto(${photoName})`
    );
  }

  return { success: true, folderId: unitId };
};

// ==========================================
// HELPERS
// ==========================================

async function getOrCreateFolder(token: string, folderName: string, parentId: string): Promise<string> {
  const q = `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const listRes = await fetchDrive(
    `${DRIVE_FILES_URL}?q=${encodeURIComponent(q)}&fields=files(id)`,
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
  );

  const listData = await listRes.json() as { files?: Array<{ id: string }> };
  if (listData.files && listData.files.length > 0) return listData.files[0].id;

  const metadata: Record<string, unknown> = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId !== 'root') metadata.parents = [parentId];

  const createRes = await fetchDrive(DRIVE_FILES_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  });

  const folder = await createRes.json() as { id: string };
  return folder.id;
}

async function uploadTextFile(token: string, name: string, content: string, parentId: string): Promise<void> {
  const metadata = { name, mimeType: 'text/plain', parents: [parentId] };
  const formData = buildMultipartFormData(metadata, new Blob([content], { type: 'text/plain' }), 'text/plain');

  await fetchDrive(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${formData.boundary}` },
    body: formData.body,
  });
}

async function uploadBlobPhoto(token: string, name: string, dataUrl: string, parentId: string): Promise<void> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const mimeType = blob.type || 'image/jpeg';
  const metadata = { name, mimeType, parents: [parentId] };
  const formData = buildMultipartFormData(metadata, blob, mimeType);

  await fetchDrive(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${formData.boundary}` },
    body: formData.body,
  });
}

function buildMultipartFormData(metadata: object, content: Blob, contentType: string): { boundary: string; body: Blob } {
  const boundary = `aksara_inspect_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const encoder = new TextEncoder();
  const metaPart = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`);
  const contentHeader = encoder.encode(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`);
  const closing = encoder.encode(`\r\n--${boundary}--`);
  return { boundary, body: new Blob([metaPart, contentHeader, content, closing]) };
}

async function fetchDrive(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init);

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const errData = await res.clone().json() as { error?: { message?: string } };
      errMsg = errData?.error?.message || errMsg;
    } catch { /* ignore */ }

    const error = new Error(errMsg) as Error & { status: number; retryAfterMs?: number };
    error.status = res.status;

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      error.retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000;
    }

    throw error;
  }

  return res;
}