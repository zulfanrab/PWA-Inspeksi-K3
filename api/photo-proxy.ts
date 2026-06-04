import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';

function getDriveClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.VITE_GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { fileId } = req.query;
  if (!fileId || typeof fileId !== 'string') {
    return res.status(400).json({ error: 'fileId wajib diisi' });
  }

  try {
    const drive = getDriveClient();
    const response = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' }
    );

    const buffer = Buffer.from(response.data as ArrayBuffer);
    res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(buffer);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}