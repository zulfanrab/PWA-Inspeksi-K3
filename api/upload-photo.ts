import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'stream';
import { getDriveClient } from './driveClient.js';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
 * Buat nama file foto deterministik & bebas tabrakan tanpa perlu list folder Drive terlebih dahulu.
 */
function buildPhotoFileName(
  photoNumber: unknown,
  photoIndex: unknown,
  photoUid: unknown,
  extension: string
): string {
  let seq = 1;
  if (typeof photoNumber === 'number' && Number.isFinite(photoNumber) && photoNumber > 0) {
    seq = Math.floor(photoNumber);
  } else if (typeof photoIndex === 'number' && Number.isFinite(photoIndex) && photoIndex >= 0) {
    seq = Math.floor(photoIndex) + 1;
  }

  const paddedNum = String(seq).padStart(3, '0');
  const rawUid = typeof photoUid === 'string' ? photoUid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6) : '';
  const uniqueSuffix = rawUid || Date.now().toString(36).slice(-4);
  return `foto-${paddedNum}-${uniqueSuffix}.${extension}`;
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

  const { folderId, photoBase64, photoIndex, photoNumber, photoUid } = req.body ?? {};

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

    const photoName = buildPhotoFileName(photoNumber, photoIndex, photoUid, extension);

    // ── Upload ke Drive (1 round-trip tanpa list/permission berulang) ─────────
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
      supportsAllDrives: true,
    });

    const fileId = uploadedFile.data.id;
    if (!fileId) {
      throw new Error('Drive tidak mengembalikan file ID setelah upload.');
    }

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