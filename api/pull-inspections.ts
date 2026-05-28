// api/pull-inspections.ts
// FIXED: Ganti Service Account → OAuth Refresh Token

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

    // Cari semua data-inspeksi.json di Drive owner
    const q = `name='data-inspeksi.json' and mimeType='text/plain' and trashed=false`;
    const listRes = await drive.files.list({
      q,
      fields: 'files(id, name, modifiedTime)',
      spaces: 'drive',
      pageSize: 1000,
    });

    const files = listRes.data.files ?? [];
    const results: any[] = [];

    for (const file of files) {
      try {
        const contentRes = await drive.files.get(
          { fileId: file.id!, alt: 'media' },
          { responseType: 'text' }
        );
        const parsed = JSON.parse(contentRes.data as string);
        results.push(parsed);
      } catch (fileErr) {
        console.warn(`[pull-inspections] Skip file ${file.id}:`, fileErr);
      }
    }

    return res.status(200).json({ inspections: results });

  } catch (err: any) {
    console.error('[api/pull-inspections] Error:', err);
    return res.status(500).json({ error: err.message || 'Gagal pull inspections' });
  }
}