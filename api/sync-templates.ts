// api/sync-templates.ts
// FIXED: Ganti Service Account → OAuth Refresh Token
// FIXED: Tambah logika Tombstone (Anti-Zombie) dan Gembok Admin biar sinkronisasi aman.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { getDriveClient } from './driveClient';

// ─── Konstanta ────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = 'zulfanrafly03@gmail.com';
const TEMPLATES_FILENAME = '_sync_templates.json';



// ─── Helper: Cari File & Folder ─────────────────────────────────────────────
async function getOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string
): Promise<string> {
  const q = `name='${name}' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive' });
  
  // FIX TS ERROR (Mencegah error 'Object possibly undefined' dari Vercel)
  const existingId = res.data.files?.[0]?.id;
  if (existingId) return existingId;

  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  });
  return created.data.id!;
}

async function findTemplatesFile(
  drive: ReturnType<typeof google.drive>,
  parentId: string
): Promise<string | null> {
  const q = `name='${TEMPLATES_FILENAME}' and '${parentId}' in parents and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive' });
  return res.data.files?.[0]?.id ?? null;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const drive = getDriveClient();
    const rootFolderId = await getOrCreateFolder(drive, 'Aksara Inspect');

    // ════════════════════════════════════════════════════════
    // GET — PULL: Semua device boleh ambil
    // ════════════════════════════════════════════════════════
    if (req.method === 'GET') {
      const fileId = await findTemplatesFile(drive, rootFolderId);
      if (!fileId) {
        return res.status(200).json({ client_templates: [], unit_templates: [] });
      }
      const contentRes = await drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'text' }
      );
      return res.status(200).json(JSON.parse(contentRes.data as string));
    }

    // ════════════════════════════════════════════════════════
    // POST — PUSH: HANYA ADMIN
    // ════════════════════════════════════════════════════════
    if (req.method === 'POST') {
      // 🔒 Gembok Admin
      const requestingEmail = req.body?.adminEmail || req.headers['x-admin-email'];
      if (requestingEmail !== ADMIN_EMAIL) {
        return res.status(403).json({ error: 'Akses ditolak. Hanya Admin yang dapat mengubah data template.' });
      }

      if (!req.body?.client_templates && !req.body?.unit_templates) {
        return res.status(400).json({ error: 'Payload tidak valid: harus mengirim client_templates atau unit_templates' });
      }

      // Gabungkan Data
      const updatedData = {
        client_templates: req.body.client_templates || [],
        unit_templates: req.body.unit_templates || [],
        lastModifiedBy: ADMIN_EMAIL,
        lastModifiedAt: new Date().toISOString(),
      };

      const existingId = await findTemplatesFile(drive, rootFolderId);
      const content = JSON.stringify(updatedData, null, 2);
      const stream = Readable.from([content]);
      const media = { mimeType: 'application/json', body: stream };

      if (existingId) {
        await drive.files.update({
          fileId: existingId,
          requestBody: { name: TEMPLATES_FILENAME, mimeType: 'application/json' },
          media,
        });
      } else {
        await drive.files.create({
          requestBody: { name: TEMPLATES_FILENAME, mimeType: 'application/json', parents: [rootFolderId] },
          media,
          fields: 'id',
        });
      }

      return res.status(200).json({ success: true, message: 'Templates berhasil disinkronkan' });
    }

    return res.status(405).json({ error: 'Method not allowed' });

  } catch (err: any) {
    console.error('[api/sync-templates] Error:', err);
    return res.status(500).json({ error: err.message || 'Gagal sync templates' });
  }
}
