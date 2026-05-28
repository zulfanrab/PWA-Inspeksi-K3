// api/sync-templates.ts
// FIXED: Ganti Service Account → OAuth Refresh Token

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { Readable } from 'stream';

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

async function findFile(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string
): Promise<string | null> {
  const q = `name='${name}' and '${parentId}' in parents and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive' });
  return res.data.files?.[0]?.id ?? null;
}

async function getOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string
): Promise<string> {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive' });
  if (res.data.files?.[0]?.id) return res.data.files[0].id;

  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return created.data.id!;
}

async function upsertTextFile(
  drive: ReturnType<typeof google.drive>,
  name: string,
  content: string,
  parentId: string
): Promise<void> {
  const existingId = await findFile(drive, name, parentId);
  const stream = Readable.from([content]);
  const media = { mimeType: 'text/plain', body: stream };

  if (existingId) {
    await drive.files.update({
      fileId: existingId,
      requestBody: { name, mimeType: 'text/plain' },
      media,
    });
  } else {
    await drive.files.create({
      requestBody: { name, mimeType: 'text/plain', parents: [parentId] },
      media,
      fields: 'id',
    });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const drive = getDriveClient();
    const rootFolderId = await getOrCreateFolder(drive, 'Aksara Inspect');

    if (req.method === 'GET') {
      const fileId = await findFile(drive, '_sync_templates.json', rootFolderId);
      if (!fileId) {
        return res.status(200).json({ clients: [], version: 0, exportedAt: null });
      }
      const contentRes = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'text' }
      );
      return res.status(200).json(JSON.parse(contentRes.data as string));
    }

    if (req.method === 'POST') {
      if (!req.body?.clients) {
        return res.status(400).json({ error: 'Payload tidak valid: clients wajib ada' });
      }
      await upsertTextFile(
        drive,
        '_sync_templates.json',
        JSON.stringify(req.body, null, 2),
        rootFolderId
      );
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err: any) {
    console.error('[api/sync-templates] Error:', err);
    return res.status(500).json({ error: err.message || 'Gagal sync templates' });
  }
}