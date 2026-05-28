// api/pull-inspections.ts
// NEW: Vercel serverless function
// Baca semua file data-inspeksi.json dari Drive owner
// Return ke frontend untuk di-merge ke IndexedDB lokal

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';

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
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  return google.drive({ version: 'v3', auth });
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const drive = getDriveClient();

    // Cari semua file bernama 'data-inspeksi.json' di seluruh Drive owner
    const q = `name='data-inspeksi.json' and mimeType='text/plain' and trashed=false`;
    const listRes = await drive.files.list({
      q,
      fields: 'files(id, name, modifiedTime)',
      spaces: 'drive',
      pageSize: 1000,
    });

    const files = listRes.data.files ?? [];
    const results: any[] = [];

    // Download isi setiap file
    for (const file of files) {
      try {
        const contentRes = await drive.files.get(
          { fileId: file.id!, alt: 'media' },
          { responseType: 'text' }
        );
        const parsed = JSON.parse(contentRes.data as string);
        results.push(parsed);
      } catch (fileErr) {
        // Skip file yang gagal di-parse, jangan crash semua
        console.warn(`[pull-inspections] Skip file ${file.id}:`, fileErr);
      }
    }

    return res.status(200).json({ inspections: results });

  } catch (err: any) {
    console.error('[api/pull-inspections] Error:', err);
    return res.status(500).json({ error: err.message || 'Gagal pull inspections' });
  }
}