import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDriveClient } from './driveClient.js';

const DRIVE_ID_RE = /^[a-zA-Z0-9_-]{10,128}$/;
const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { fileId } = req.query;
  if (!fileId || typeof fileId !== 'string' || !DRIVE_ID_RE.test(fileId)) {
    return res.status(400).json({ error: 'Format fileId tidak valid.' });
  }

  try {
    const drive = getDriveClient();
    const meta = await drive.files.get({
      fileId,
      fields: 'id, mimeType, trashed',
      supportsAllDrives: true,
    });

    if (meta.data.trashed) {
      return res.status(404).json({ error: 'File gambar tidak ditemukan.' });
    }

    const mime = String(meta.data.mimeType || '').toLowerCase().split(';')[0].trim();
    if (!ALLOWED_IMAGE_MIMES.has(mime)) {
      return res.status(403).json({ error: 'Jenis file tidak diizinkan untuk proxy gambar.' });
    }

    const response = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'arraybuffer' }
    );

    const buffer = Buffer.from(response.data as ArrayBuffer);
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return res.status(200).send(buffer);
  } catch (err: any) {
    console.error('[api/photo-proxy] Error:', err?.message || err);
    return res.status(500).json({ error: 'Gagal memuat gambar dari Google Drive.' });
  }
}
