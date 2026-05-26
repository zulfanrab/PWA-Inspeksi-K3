// src/services/driveService.ts
// FIXED: Blob upload (bukan base64 multipart), retry dengan exponential backoff,
//        progress indicator per foto, dan rate limit handling

import type { InspectionSession, InspectionPhoto } from '../db/db';

// ==========================================
// TYPES
// ==========================================

export interface UploadProgress {
  current: number;
  total: number;
  fileName: string;
  phase: 'folder' | 'data' | 'photo';
}

type ProgressCallback = (progress: UploadProgress) => void;

// ==========================================
// CONSTANTS
// ==========================================

const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const ROOT_FOLDER_NAME = 'Aksara Inspect';

// FIXED: Retry config untuk handle rate limit (HTTP 429) dan error sementara
const RETRY_CONFIG = {
  maxAttempts: 4,
  baseDelayMs: 1000,
  maxDelayMs: 16000,
};

// ==========================================
// TOKEN HELPERS
// ==========================================

// FIXED: Cek token valid + belum expired sebelum dipakai
export function getValidToken(): string {
  const token = localStorage.getItem('google_token');
  const expiryStr = localStorage.getItem('google_token_expiry');

  if (!token) throw new TokenExpiredError('Belum login ke Google Drive.');

  if (expiryStr) {
    const expiry = parseInt(expiryStr, 10);
    // Beri buffer 60 detik agar tidak expired di tengah upload
    if (Date.now() > expiry - 60_000) {
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
  localStorage.setItem(
    'google_token_expiry',
    String(Date.now() + expiresInSeconds * 1000)
  );
}

export function clearToken() {
  localStorage.removeItem('google_token');
  localStorage.removeItem('google_token_expiry');
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

// FIXED: Exponential backoff untuk handle rate limit (429) dan 5xx errors
async function withRetry<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;

      // Jangan retry kalau bukan error sementara
      if (err instanceof TokenExpiredError) throw err;
      if (err?.status === 403 || err?.status === 401) throw err;

      if (attempt === RETRY_CONFIG.maxAttempts) break;

      const delay = Math.min(
        RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt - 1),
        RETRY_CONFIG.maxDelayMs
      );

      console.warn(
        `[DriveService] ${context} — attempt ${attempt} gagal, retry dalam ${delay}ms:`,
        err?.message
      );

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
  _photos: InspectionPhoto[], // deprecated param, pakai session.photos langsung
  onProgress?: ProgressCallback
): Promise<{ success: true; folderId: string }> => {
  const token = getValidToken(); // FIXED: Validasi + expiry check di awal

  const totalPhotos = session.photos.length;
  const totalSteps = totalPhotos + 2; // +2 untuk folder setup + file data

  // ---- 1. Setup folder hierarchy ----
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

  // ---- 2. Upload file data JSON ----
  onProgress?.({ current: 1, total: totalSteps, fileName: 'data-inspeksi.json', phase: 'data' });

  const dataPayload = JSON.stringify(
    {
      id: session.id,
      clientName: session.clientName,
      objectType: session.objectType,
      createdAt: new Date(session.createdAt).toISOString(),
      updatedAt: session.updatedAt ? new Date(session.updatedAt).toISOString() : null,
      unitData: session.unitData,
      totalPhotos,
    },
    null,
    2
  );

  await withRetry(
    () => uploadTextFile(token, 'data-inspeksi.json', dataPayload, unitId),
    'uploadTextFile(data-inspeksi.json)'
  );

  // ---- 3. Upload foto satu per satu dengan progress ----
  // FIXED: Gunakan Blob langsung, bukan string base64 dalam multipart body
  for (let i = 0; i < session.photos.length; i++) {
    const photo = session.photos[i];
    const photoName = `foto-${String(i + 1).padStart(3, '0')}.jpg`;

    onProgress?.({
      current: i + 2,
      total: totalSteps,
      fileName: photoName,
      phase: 'photo',
    });

    await withRetry(
      () => uploadBlobPhoto(token, photoName, photo.dataUrl, unitId),
      `uploadBlobPhoto(${photoName})`
    );
  }

  return { success: true, folderId: unitId };
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

// FIXED: Tambahkan retry di level caller, fungsi ini tetap bersih
async function getOrCreateFolder(
  token: string,
  folderName: string,
  parentId: string
): Promise<string> {
  // Cari folder yang sudah ada
  const q = `name='${folderName.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const listRes = await fetchDrive(
    `${DRIVE_FILES_URL}?q=${encodeURIComponent(q)}&fields=files(id)`,
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } }
  );

  const listData = await listRes.json();
  if (listData.files?.length > 0) return listData.files[0].id as string;

  // Buat baru kalau tidak ada
  const metadata: Record<string, any> = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId !== 'root') metadata.parents = [parentId];

  const createRes = await fetchDrive(DRIVE_FILES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  const folder = await createRes.json();
  return folder.id as string;
}

async function uploadTextFile(
  token: string,
  name: string,
  content: string,
  parentId: string
): Promise<void> {
  // FIXED: Pakai Blob, bukan string concatenation multipart manual
  const metadata = { name, mimeType: 'text/plain', parents: [parentId] };
  const formData = buildMultipartFormData(
    metadata,
    new Blob([content], { type: 'text/plain' }),
    'text/plain'
  );

  await fetchDrive(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${formData.boundary}`,
    },
    body: formData.body,
  });
}

// FIXED: Upload foto sebagai Blob binary bukan base64 string
//        Lebih efisien ~33% karena tidak ada overhead encoding base64
async function uploadBlobPhoto(
  token: string,
  name: string,
  dataUrl: string,
  parentId: string
): Promise<void> {
  // Convert dataUrl → Blob binary
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const mimeType = blob.type || 'image/jpeg';

  const metadata = { name, mimeType, parents: [parentId] };
  const formData = buildMultipartFormData(metadata, blob, mimeType);

  await fetchDrive(DRIVE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${formData.boundary}`,
    },
    body: formData.body,
  });
}

// ==========================================
// MULTIPART BUILDER (Blob-based)
// ==========================================

// FIXED: Build multipart menggunakan Blob concat — tidak ada string base64
function buildMultipartFormData(
  metadata: object,
  content: Blob,
  contentType: string
): { boundary: string; body: Blob } {
  const boundary = `aksara_inspect_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const encoder = new TextEncoder();

  const metaPart = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`
  );
  const contentHeader = encoder.encode(
    `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`
  );
  const closing = encoder.encode(`\r\n--${boundary}--`);

  const body = new Blob([metaPart, contentHeader, content, closing]);
  return { boundary, body };
}

// ==========================================
// FETCH WRAPPER (dengan error parsing)
// ==========================================

async function fetchDrive(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init);

  if (!res.ok) {
    // FIXED: Parse error body untuk pesan yang lebih informatif
    let errMsg = `HTTP ${res.status}`;
    try {
      const errData = await res.clone().json();
      errMsg = errData?.error?.message || errMsg;
    } catch {
      // ignore
    }

    const error: any = new Error(errMsg);
    error.status = res.status;

    // FIXED: Rate limit — lempar error agar withRetry bisa retry
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After');
      error.retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000;
    }

    throw error;
  }

  return res;
}