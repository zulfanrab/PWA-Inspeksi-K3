import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'stream';
import { getDriveClient } from './driveClient';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DRIVE_QUERY_FIELDS = 'files(id,name)';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Ekstrak raw base64 dan deteksi MIME type dari data URI atau raw base64.
 * Mengembalikan null jika format tidak dikenali atau MIME tidak diizinkan.
 */
function parsePhotoBase64(
  input: string
): { rawBase64: string; mimeType: string; extension: string } | null {
  let rawBase64: string;
  let mimeType: string;

  const dataUriMatch = input.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9+\-.]+);base64,(.+)$/s);

  if (dataUriMatch) {
    mimeType = dataUriMatch[1].toLowerCase();
    rawBase64 = dataUriMatch[2];
  } else {
    // Asumsikan raw base64 tanpa header = JPEG
    mimeType = 'image/jpeg';
    rawBase64 = input;
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) return null;

  const extensionMap: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };

  return { rawBase64, mimeType, extension: extensionMap[mimeType] };
}

/**
 * Konversi raw base64 string ke Readable stream.
 * Stream dibuat fresh setiap panggilan — tidak bisa di-reuse.
 */
function base64ToStream(rawBase64: string): Readable {
  const buffer = Buffer.from(rawBase64, 'base64');
  return Readable.from(buffer);
}

/**
 * Hitung jumlah file foto yang sudah ada di folder Drive.
 * Exclude folder dan file JSON dari hitungan.
 * Menggunakan pageToken untuk handle folder dengan >1000 file.
 */
async function countExistingPhotos(
  drive: ReturnType<typeof getDriveClient>,
  parentId: string
): Promise<number> {
  // Escape single quote dalam parentId untuk keamanan query
  const safeParentId = parentId.replace(/'/g, "\\'");
  const q = [
    `'${safeParentId}' in parents`,
    `mimeType != 'application/vnd.google-apps.folder'`,
    `name != 'data-inspeksi.json'`,
    `trashed = false`,
  ].join(' and ');

  let totalCount = 0;
  let pageToken: string | undefined = undefined;

  // Loop untuk handle pagination — pageSize 1000 tidak menjamin semua file
  do {
    const response = await drive.files.list({
      q,
      fields: DRIVE_QUERY_FIELDS,
      spaces: 'drive',
      pageSize: 1000,
      ...(pageToken ? { pageToken } : {}),
    });

    totalCount += response.data.files?.length ?? 0;
    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return totalCount;
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { folderId, photoBase64, photoIndex } = req.body ?? {};

  // ── Validasi Input ──────────────────────────────────────────────────────────
  if (typeof folderId !== 'string' || !folderId.trim()) {
    return res.status(400).json({ error: 'folderId wajib diisi dan harus berupa string.' });
  }
  if (typeof photoBase64 !== 'string' || !photoBase64.trim()) {
    return res.status(400).json({ error: 'photoBase64 wajib diisi dan harus berupa string.' });
  }

  // ── Validasi Ukuran ─────────────────────────────────────────────────────────
  // Estimasi ukuran asli dari panjang base64 (overhead ~33%)
  const rawBase64Portion = photoBase64.includes(',')
    ? photoBase64.split(',')[1]
    : photoBase64;
  const estimatedSizeBytes = Math.ceil((rawBase64Portion.length * 3) / 4);

  if (estimatedSizeBytes > MAX_SIZE_BYTES) {
    return res.status(413).json({
      error: `Ukuran foto melebihi batas 4MB. Ukuran estimasi: ${(estimatedSizeBytes / 1024 / 1024).toFixed(2)}MB`,
      photoIndex,
    });
  }

  // ── Validasi Format ─────────────────────────────────────────────────────────
  const parsed = parsePhotoBase64(photoBase64);
  if (!parsed) {
    return res.status(400).json({
      error: `Format foto tidak didukung. Hanya JPEG, PNG, dan WebP yang diizinkan.`,
      photoIndex,
    });
  }

  const { rawBase64, mimeType, extension } = parsed;

  try {
    const drive = getDriveClient();

    // ── Smart Append ──────────────────────────────────────────────────────────
    const existingCount = await countExistingPhotos(drive, folderId);
    const photoNumber = existingCount + 1;
    const paddedNum = String(photoNumber).padStart(3, '0');
    const photoName = `foto-${paddedNum}.${extension}`;

    // ── Upload ke Drive ───────────────────────────────────────────────────────
    const uploadedFile = await drive.files.create({
      requestBody: {
        name: photoName,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: base64ToStream(rawBase64),
      },
      fields: 'id,name',
    });

    const fileId = uploadedFile.data.id;
    if (!fileId) {
      throw new Error('Drive tidak mengembalikan file ID setelah upload.');
    }

    // ── Set Permission Public ─────────────────────────────────────────────────
    await drive.permissions.create({
      fileId,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
      // Suppress domain policy warnings yang bisa bikin response lambat
      fields: 'id',
    });

    return res.status(200).json({
      success: true,
      photoIndex,
      fileId,
      fileName: uploadedFile.data.name,
      viewUrl: `https://drive.google.com/uc?id=${fileId}`,
      message: `Berhasil upload ${photoName}`,
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = (error as any)?.response?.data ?? null;

    // Log detail penuh di server, jangan expose ke client
    console.error(`[upload-photo] Error foto index ${photoIndex}:`, errorMessage);
    if (errorDetails) {
      console.error('[upload-photo] Google API error detail:', JSON.stringify(errorDetails));
    }

    // Deteksi error spesifik untuk debugging lebih mudah
    const status = (error as any)?.response?.status ?? 500;
    const isGoogleError = !!errorDetails;

    return res.status(status >= 400 && status < 600 ? status : 500).json({
      error: isGoogleError
        ? `Google Drive API error: ${errorDetails?.error?.message ?? errorMessage}`
        : 'Gagal upload foto ke Drive.',
      photoIndex,
      // Hanya kirim detail di non-production untuk debugging
      ...(process.env.NODE_ENV !== 'production' && { detail: errorMessage }),
    });
  }
}