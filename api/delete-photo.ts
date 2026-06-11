import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';

function getDriveClient() {
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('ENV tidak lengkap');
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId, clientSecret,
    'https://developers.google.com/oauthplayground'
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fileId, userEmail } = req.body;

    if (!fileId) return res.status(400).json({ error: 'fileId wajib ada' });

    const ADMIN_EMAIL = 'zulfanrafly03@gmail.com';
    if (userEmail !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Akses ditolak' });
    }

    const drive = getDriveClient();
    await drive.files.update({
      fileId,
      requestBody: { trashed: true },
    });

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[api/delete-photo] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Gagal hapus foto' });
  }
}