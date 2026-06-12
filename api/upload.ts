// api/upload.ts
// VERSI BARU (SMART APPEND PHASE 1)
// Tugas file ini HANYA membuat folder dan file JSON. 
// Foto TIDAK lagi di-upload di sini untuk mencegah Error 413 Payload Too Large.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { Readable } from 'stream';
import { getDriveClient } from './driveClient';



// ─── FOLDER & FILE HELPERS ───────────────────────────────────────────────────
async function findFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string | null
): Promise<string | null> {
  const parentQuery = parentId ? `'${parentId}' in parents` : `'root' in parents`;
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and ${parentQuery} and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive' });
  return res.data.files?.[0]?.id ?? null;
}

async function getOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string | null
): Promise<string> {
  const existing = await findFolder(drive, name, parentId);
  if (existing) return existing;

  const requestBody: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) requestBody.parents = [parentId];

  const res = await drive.files.create({ requestBody, fields: 'id' });
  return res.data.id!;
}

async function upsertTextFile(
  drive: ReturnType<typeof google.drive>,
  name: string,
  content: string,
  parentId: string
): Promise<void> {
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`;
  const listRes = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive' });
  const existingId = listRes.data.files?.[0]?.id;
  const stream = Readable.from([content]);
  const media = { mimeType: 'application/json', body: stream };

  if (existingId) {
    await drive.files.update({
      fileId: existingId,
      requestBody: { name, mimeType: 'application/json' },
      media,
    });
  } else {
    await drive.files.create({
      requestBody: { name, mimeType: 'application/json', parents: [parentId] },
      media,
      fields: 'id',
    });
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Terima data dari format baru (inspectionData) atau format lama (session)
    const session = req.body.inspectionData || req.body.session;

    if (!session?.id) {
      return res.status(400).json({ error: 'Payload tidak valid: data inspeksi wajib ada' });
    }

    const drive = getDriveClient();

// Kalau sudah punya folderId (edit), skip buat folder baru
let unitFolderId: string;
    if (req.body.existingFolderId) {
      unitFolderId = req.body.existingFolderId;
    } else {
      // Validasi variabel
      const envRootId = process.env.ROOT_FOLDER_ID?.trim();
      
      // Kalau env ada, pake itu. Kalau gak ada, baru cari.
      const rootFolderId = envRootId 
        ? envRootId 
        : await getOrCreateFolder(drive, 'Aksara Inspect', null);
      
      console.log('Menggunakan Root Folder ID:', rootFolderId); // Buat ngetes di log

      const clientFolderId = await getOrCreateFolder(drive, session.clientName, rootFolderId);
      const dateStr = new Date(session.createdAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
      const dateFolderId = await getOrCreateFolder(drive, dateStr, clientFolderId);
      
      const objectTypeLabel: Record<string, string> = {
        'Angkur': 'Safety Anchor',
        'PAA': 'Pesawat Angkat & Angkut',
        'PUBT': 'Pesawat Uap & Bejana Tekan',
        'PTP': 'Pesawat Tenaga & Produksi',
        'Listrik': 'Instalasi Listrik',
        'Penyalur Petir': 'Instalasi Penyalur Petir',
        'Lift': 'Elevator & Eskalator',
        'Proteksi Kebakaran': 'Proteksi Kebakaran',
      };
      
      const typeFolderName = objectTypeLabel[session.objectType] ?? session.objectType;
      const typeFolderId = await getOrCreateFolder(drive, typeFolderName, dateFolderId);
      const unitFolderName = `${session.unitData?.namaUnit || 'Unit'} - ${session.unitData?.nomorSeri || 'NoSeri'}`;
      unitFolderId = await getOrCreateFolder(drive, unitFolderName, typeFolderId);
    }

    // 2. Upload JSON Metadata
    const dataPayload = JSON.stringify({
      id: session.id,
      clientName: session.clientName,
      objectType: session.objectType,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      unitData: session.unitData,
      totalPhotos: session.totalPhotos || 0, // Info dari frontend
      inspectorEmail: session.inspectorEmail ?? null,
    }, null, 2);
    
    await upsertTextFile(drive, 'data-inspeksi.json', dataPayload, unitFolderId);

    // 3. SELESAI. Cuma balikin folderId buat dipake sama fungsi upload foto
    return res.status(200).json({
      success: true,
      folderId: unitFolderId,
      message: 'Folder dan metadata JSON berhasil dibuat',
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload meta gagal';
    console.error('[api/upload] Error:', message);
    return res.status(500).json({ error: message });
  }
}
