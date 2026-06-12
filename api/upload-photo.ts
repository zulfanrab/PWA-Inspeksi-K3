// api/upload-photo.ts
// TUGAS: Menerima 1 foto, memberi nomor urut otomatis (Smart Append), dan menyimpannya ke Drive.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { getDriveClient } from './driveClient';



// ─── HELPERS ──────────────────────────────────────────────────────────────────
// FIX TS ERROR: Menghapus variabel `mimeType` yang nganggur biar Vercel nggak ngamuk.
function base64ToStream(base64: string): Readable {
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
  const buffer = Buffer.from(base64Data, 'base64');
  return Readable.from(buffer);
}

// Hitung foto yang udah ada biar nomor urutnya pinter (Smart Append)
async function countExistingPhotos(
  drive: ReturnType<typeof google.drive>,
  parentId: string
): Promise<number> {
  const q = `'${parentId}' in parents and mimeType != 'application/vnd.google-apps.folder' and name != 'data-inspeksi.json' and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive', pageSize: 1000 });
  return res.data.files?.length ?? 0;
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { folderId, photoBase64, photoIndex } = req.body;

    if (!folderId || !photoBase64) {
      return res.status(400).json({ error: 'folderId dan photoBase64 wajib diisi' });
    }

    // PENGAMAN 413: Pastikan ukuran base64 nggak lebih dari 4MB (Batas aman Vercel)
    const estimatedSizeBytes = (photoBase64.length * 3) / 4;
    const maxSizeBytes = 4 * 1024 * 1024; // 4MB
    if (estimatedSizeBytes > maxSizeBytes) {
      return res.status(413).json({
        error: `Ukuran foto terlalu besar. Maksimal 4MB per foto.`,
        photoIndex,
      });
    }

    const drive = getDriveClient();

    // Deteksi tipe file
    const matches = photoBase64.match(/^data:(.+);base64,/);
    const mimeType = matches ? matches[1] : 'image/jpeg';
    const extension = mimeType.split('/')[1] === 'png' ? 'png' : 'jpg';

    // SMART APPEND: Cek isi Drive sekarang
    const existingCount = await countExistingPhotos(drive, folderId);
    
    // Bikin nomor urut (Contoh: foto-004.jpg, foto-005.jpg)
    const photoNumber = existingCount + 1;
    const paddedNum = String(photoNumber).padStart(3, '0');
    const photoName = `foto-${paddedNum}.${extension}`;

    // Eksekusi Upload
    const uploadedFile = await drive.files.create({
      requestBody: {
        name: photoName,
        parents: [folderId],
      },
      media: {
        mimeType,
        body: base64ToStream(photoBase64), // FIX TS: Cukup panggil 1 parameter
      },
      fields: 'id, name',
    });
    // Set foto bisa diakses siapapun yang punya link (untuk cross-device visibility)
    await drive.permissions.create({
      fileId: uploadedFile.data.id!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    });

    return res.status(200).json({
      success: true,
      photoIndex,
      fileId: uploadedFile.data.id,
      fileName: uploadedFile.data.name,
      message: `Berhasil upload ${photoName}`
    });

  } catch (error: any) {
    console.error(`[upload-photo] Error foto index ${req.body?.photoIndex}:`, error.message);
    return res.status(500).json({
      error: 'Gagal upload foto',
      detail: error.message,
      photoIndex: req.body?.photoIndex,
    });
  }
}
