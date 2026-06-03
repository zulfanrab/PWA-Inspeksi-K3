// api/pull-inspections.ts
// FIXED: Menghapus filter mimeType yang kaku, dan bikin sistem baca JSON jadi kebal error.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';

function getDriveClient() {
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('ENV tidak lengkap: butuh VITE_GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN');
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'https://developers.google.com/oauthplayground'
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const drive = getDriveClient();

    // 🔥 FIX UTAMA: mimeType dihapus dari pencarian biar data versi lama & baru kebaca semua
    const q = `name='data-inspeksi.json' and trashed=false`;
    
    const listRes = await drive.files.list({
      q,
      fields: 'files(id, name, modifiedTime, parents)',
      spaces: 'drive',
      pageSize: 1000,
    });

    const files = listRes.data.files ?? [];
    const results: any[] = [];

    for (const file of files) {
      try {
        const contentRes = await drive.files.get(
          { fileId: file.id!, alt: 'media' },
          { responseType: 'json' } // Biarkan googleapis yang nentuin ini teks atau objek
        );
        
        // 🔥 FIX PARSER: Kebal dari error JSON.parse
        let parsed;
        if (typeof contentRes.data === 'string') {
          parsed = JSON.parse(contentRes.data);
        } else {
          parsed = contentRes.data;
        }

        // Ambil fileId foto dari folder yang sama
        const folderId = file.parents?.[0];
if (folderId) {
  const photoRes = await drive.files.list({
    q: `'${folderId}' in parents and name != 'data-inspeksi.json' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
    pageSize: 1000,
  });
  parsed.drivePhotoIds = (photoRes.data.files ?? []).map((f) => f.id!);
} else {
  parsed.drivePhotoIds = [];
}

results.push(parsed);
} catch (fileErr) {
        console.warn(`[pull-inspections] Gagal baca file ${file.id}:`, fileErr);
      }
    }

    return res.status(200).json({ inspections: results });

  } catch (err: any) {
    console.error('[api/pull-inspections] Error:', err);
    return res.status(500).json({ error: err.message || 'Gagal mengambil data inspeksi' });
  }
}