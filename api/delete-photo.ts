import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDriveClient } from './driveClient.js';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim() || 'zulfanrafly03@gmail.com';
const DRIVE_ID_RE = /^[a-zA-Z0-9_-]{10,128}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fileId, userEmail } = req.body || {};

    if (!fileId || typeof fileId !== 'string' || !DRIVE_ID_RE.test(fileId)) {
      return res.status(400).json({ error: 'fileId tidak valid.' });
    }

    if (userEmail !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Akses ditolak.' });
    }

    const drive = getDriveClient();
    await drive.files.update({
      fileId,
      requestBody: { trashed: true },
      supportsAllDrives: true,
    });

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[api/delete-photo] Error:', err?.message || err);
    return res.status(500).json({ error: 'Gagal menghapus foto di Google Drive.' });
  }
}
