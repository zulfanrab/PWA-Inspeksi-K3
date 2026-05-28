// api/sync-templates.ts
// NEW: Vercel serverless function
// GET  → pull _sync_templates.json dari Drive owner ke frontend
// POST → push _sync_templates.json dari frontend ke Drive owner

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { Readable } from 'stream';

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function getDriveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!email || !privateKey) {
    throw new Error('Service Account env vars tidak ditemukan.');
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  return google.drive({ version: 'v3', auth });
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

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const rootFolderId = process.env.GOOGLE_OWNER_DRIVE_FOLDER_ID;
  if (!rootFolderId) {
    return res.status(500).json({ error: 'GOOGLE_OWNER_DRIVE_FOLDER_ID belum diset' });
  }

  try {
    const drive = getDriveClient();

    // ── GET: Pull templates dari Drive ke frontend ──
    if (req.method === 'GET') {
      const fileId = await findFile(drive, '_sync_templates.json', rootFolderId);

      if (!fileId) {
        // Belum ada — return empty, bukan error
        return res.status(200).json({ clients: [], version: 0, exportedAt: null });
      }

      const contentRes = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'text' }
      );

      const parsed = JSON.parse(contentRes.data as string);
      return res.status(200).json(parsed);
    }

    // ── POST: Push templates dari frontend ke Drive ──
    if (req.method === 'POST') {
      const payload = req.body;

      if (!payload?.clients) {
        return res.status(400).json({ error: 'Payload tidak valid: clients wajib ada' });
      }

      await upsertTextFile(
        drive,
        '_sync_templates.json',
        JSON.stringify(payload, null, 2),
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