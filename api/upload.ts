// api/upload.ts
// NEW: Vercel serverless function
// Menerima data inspection + foto dari frontend
// Upload ke Google Drive OWNER pakai Service Account
// Sehingga semua user → data masuk ke 1 Drive yang sama

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { Readable } from 'stream';

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface PhotoPayload {
  name: string;       // "foto-001.jpg"
  dataUrl: string;    // "data:image/jpeg;base64,..."
}

interface UploadPayload {
  session: {
    id: string;
    clientName: string;
    objectType: string;
    createdAt: string;   // ISO string
    updatedAt: string | null;
    unitData: Record<string, string>;
    inspectorEmail?: string;
  };
  photos: PhotoPayload[];
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// NEW: Buat Google Drive client pakai Service Account
function getDriveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!email || !privateKey) {
    throw new Error('Service Account env vars tidak ditemukan. Cek GOOGLE_SERVICE_ACCOUNT_EMAIL dan GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY di Vercel.');
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  return google.drive({ version: 'v3', auth });
}

// NEW: Cari folder by name + parent, return id atau null
async function findFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string
): Promise<string | null> {
  const q = `name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const res = await drive.files.list({
    q,
    fields: 'files(id)',
    spaces: 'drive',
  });
  return res.data.files?.[0]?.id ?? null;
}

// NEW: Cari atau buat folder
async function getOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string
): Promise<string> {
  const existing = await findFolder(drive, name, parentId);
  if (existing) return existing;

  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });

  return res.data.id!;
}

// NEW: Upload atau update text file (JSON data inspeksi)
async function upsertTextFile(
  drive: ReturnType<typeof google.drive>,
  name: string,
  content: string,
  parentId: string
): Promise<void> {
  // Cek apakah sudah ada
  const q = `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and trashed=false`;
  const listRes = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive' });
  const existingId = listRes.data.files?.[0]?.id;

  const stream = Readable.from([content]);
  const media = { mimeType: 'text/plain', body: stream };

  if (existingId) {
    // Update file yang sudah ada
    await drive.files.update({
      fileId: existingId,
      requestBody: { name, mimeType: 'text/plain' },
      media,
    });
  } else {
    // Buat file baru
    await drive.files.create({
      requestBody: { name, mimeType: 'text/plain', parents: [parentId] },
      media,
      fields: 'id',
    });
  }
}

// NEW: Upload foto dari dataUrl
async function uploadPhoto(
  drive: ReturnType<typeof google.drive>,
  name: string,
  dataUrl: string,
  parentId: string
): Promise<void> {
  // Parse dataUrl → Buffer
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!matches) throw new Error(`DataUrl tidak valid untuk foto ${name}`);

  const mimeType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  const stream = Readable.from(buffer);

  await drive.files.create({
    requestBody: { name, mimeType, parents: [parentId] },
    media: { mimeType, body: stream },
    fields: 'id',
  });
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS — izinkan dari semua domain (frontend Vercel dan localhost)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const payload = req.body as UploadPayload;

    if (!payload?.session?.id) {
      return res.status(400).json({ error: 'Payload tidak valid: session.id wajib ada' });
    }

    const drive = getDriveClient();

    // Root folder ID dari env (folder "Aksara Inspect" di Drive owner)
    const rootFolderId = process.env.GOOGLE_OWNER_DRIVE_FOLDER_ID;
    if (!rootFolderId) {
      return res.status(500).json({ error: 'GOOGLE_OWNER_DRIVE_FOLDER_ID belum diset di Vercel env' });
    }

    const { session, photos } = payload;

    // Buat struktur folder: [Klien] / [YYYY-MM-DD] / [Jenis] / [Unit-NoSeri]
    const clientFolderId = await getOrCreateFolder(drive, session.clientName, rootFolderId);

    const dateStr = new Date(session.createdAt).toISOString().slice(0, 10);
    const dateFolderId = await getOrCreateFolder(drive, dateStr, clientFolderId);

    const typeFolderId = await getOrCreateFolder(drive, session.objectType, dateFolderId);

    const unitFolderName = `${session.unitData?.namaUnit || 'Unit'} - ${session.unitData?.nomorSeri || 'NoSeri'}`;
    const unitFolderId = await getOrCreateFolder(drive, unitFolderName, typeFolderId);

    // Upload data-inspeksi.json
    const dataPayload = JSON.stringify(
      {
        id: session.id,
        clientName: session.clientName,
        objectType: session.objectType,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        unitData: session.unitData,
        totalPhotos: photos.length,
        inspectorEmail: session.inspectorEmail ?? null,
      },
      null,
      2
    );

    await upsertTextFile(drive, 'data-inspeksi.json', dataPayload, unitFolderId);

    // Upload setiap foto
    for (const photo of photos) {
      await uploadPhoto(drive, photo.name, photo.dataUrl, unitFolderId);
    }

    return res.status(200).json({
      success: true,
      folderId: unitFolderId,
      message: `Upload selesai: ${photos.length} foto`,
    });

  } catch (err: any) {
    console.error('[api/upload] Error:', err);
    return res.status(500).json({
      error: err.message || 'Upload gagal',
    });
  }
}