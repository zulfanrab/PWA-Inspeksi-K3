// api/pull-inspections.ts
// FIXED: Menghapus filter mimeType yang kaku, dan bikin sistem baca JSON jadi kebal error.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { getDriveClient } from './driveClient.js';



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
            fields: 'files(id, name)',
            spaces: 'drive',
            pageSize: 1000,
          });
          const photoFiles = photoRes.data.files ?? [];
          // Urutkan by nama file (foto-001, foto-002, dst)
          photoFiles.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
          parsed.drivePhotoIds = photoFiles.map((f) => f.id!);
          parsed.drivePhotoFileNames = photoFiles.map((f) => f.name!);
        } else {
          parsed.drivePhotoIds = [];
          parsed.drivePhotoFileNames = [];
        }

        results.push(parsed);
      } catch (fileErr) {
        console.warn(`[pull-inspections] Gagal baca file ${file.id}:`, fileErr);
      }
    }

    // ==========================================
    // BACA TOMBSTONE (LOG PENGHAPUSAN)
    // ==========================================
    let deletedIds: string[] = [];
    try {
      const rootRes = await drive.files.list({
        q: `name='Aksara Inspect' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id)',
        spaces: 'drive',
        pageSize: 1,
      });
      const rootId = rootRes.data.files?.[0]?.id;
      
      if (rootId) {
        const logRes = await drive.files.list({
          q: `name='deleted-log.json' and '${rootId}' in parents and trashed=false`,
          fields: 'files(id)',
          spaces: 'drive',
          pageSize: 1,
        });
        
        if (logRes.data.files?.length) {
          const logContent = await drive.files.get(
            { fileId: logRes.data.files[0].id!, alt: 'media' },
            { responseType: 'json' }
          );
          const log: any[] = Array.isArray(logContent.data) ? logContent.data : [];
          deletedIds = log.map((e) => e.sessionId).filter(Boolean);
        }
      }
    } catch (e) {
      console.warn('[pull-inspections] Gagal baca deleted-log:', e);
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(200).json({ inspections: results, deletedIds });

  } catch (err: any) {
    console.error('[api/pull-inspections] Error:', err);
    return res.status(500).json({ error: err.message || 'Gagal mengambil data inspeksi' });
  }
}
