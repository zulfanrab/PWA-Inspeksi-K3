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
    const { folderId, sessionId } = req.body;
    const drive = getDriveClient();

    // SKENARIO 1: Jalur Cepat (Punya folderId dari kodingan baru Claude)
    if (folderId) {
      await drive.files.update({
        fileId: folderId,
        requestBody: { trashed: true },
      });
      return res.status(200).json({ success: true, method: 'direct_folder' });
    }

    // SKENARIO 2: Jalur Lambat (Data lama yang ga punya folderId)
    if (sessionId) {
      const q = `name='data-inspeksi.json' and mimeType='text/plain' and trashed=false`;
      const listRes = await drive.files.list({ q, fields: 'files(id, parents)', spaces: 'drive' });

      for (const file of listRes.data.files ?? []) {
        try {
          const contentRes = await drive.files.get(
            { fileId: file.id!, alt: 'media' },
            { responseType: 'text' }
          );
          const parsed = JSON.parse(contentRes.data as string);

          if (parsed.id === sessionId) {
            const parentId = file.parents?.[0];
            if (parentId) {
              await drive.files.update({ fileId: parentId, requestBody: { trashed: true } });
            }
            await drive.files.update({ fileId: file.id!, requestBody: { trashed: true } });
            return res.status(200).json({ success: true, method: 'search_session' });
          }
        } catch (e) {
          console.warn('Gagal baca file saat pencarian delete:', e);
        }
      }
      return res.status(200).json({ success: true, message: 'Sudah tidak ada di Drive' });
    }

    return res.status(400).json({ error: 'Butuh folderId atau sessionId' });

  } catch (err: any) {
    console.error('[api/delete-inspection] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Gagal hapus folder' });
  }
}