import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { getDriveClient } from './driveClient';



async function getRootFolderId(drive: any): Promise<string | null> {
  const res = await drive.files.list({
    q: `name='Aksara Inspect' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
    pageSize: 1,
  });
  return res.data.files?.[0]?.id ?? null;
}

async function appendTombstone(drive: any, sessionId: string): Promise<void> {
  const rootId = await getRootFolderId(drive);
  if (!rootId) return;

  const logName = 'deleted-log.json';
  const existing = await drive.files.list({
    q: `name='${logName}' and '${rootId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
    pageSize: 1,
  });

  const entry = { sessionId, deletedAt: new Date().toISOString() };

  if (existing.data.files?.length) {
    const fileId = existing.data.files[0].id!;
    const contentRes = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'json' }
    );
    const current: any[] = Array.isArray(contentRes.data) ? contentRes.data : [];
    current.push(entry);
    const { Readable } = await import('stream');
    const stream = Readable.from([JSON.stringify(current)]);
    await drive.files.update({
      fileId,
      media: { mimeType: 'application/json', body: stream },
    });
  } else {
    const { Readable } = await import('stream');
    const stream = Readable.from([JSON.stringify([entry])]);
    await drive.files.create({
      requestBody: {
        name: logName,
        parents: [rootId],
        mimeType: 'application/json',
      },
      media: { mimeType: 'application/json', body: stream },
    });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1. Tangkap userEmail dari frontend
    const { folderId, sessionId, userEmail } = req.body;
    
    // ==========================================
    // 2. GEMBOK ADMIN
    // ==========================================
    const ADMIN_EMAIL = 'zulfanrafly03@gmail.com';
    if (userEmail !== ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Akses Ditolak: Hanya Admin yang bisa menghapus data server.' });
    }
    // ==========================================

    const drive = getDriveClient();

    // SKENARIO 1: Jalur Cepat (Punya folderId dari kodingan baru)
    if (folderId) {
      await drive.files.update({
        fileId: folderId,
        requestBody: { trashed: true },
      });
      await appendTombstone(drive, sessionId || folderId);
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
            
            await appendTombstone(drive, sessionId);
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
