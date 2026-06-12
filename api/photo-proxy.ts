import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { getDriveClient } from './driveClient.js';



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
