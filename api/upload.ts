// api/upload.ts
// FIXED: Ganti Service Account → OAuth Refresh Token dari akun owner
// Semua upload masuk ke Google Drive zulfanrafly03@gmail.com langsung

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { google } from 'googleapis';
import { Readable } from 'stream';

interface PhotoPayload {
  name: string;
  dataUrl: string;
}

interface UploadPayload {
  session: {
    id: string;
    clientName: string;
    objectType: string;
    createdAt: string;
    updatedAt: string | null;
    unitData: Record<string, string>;
    inspectorEmail?: string;
  };
  photos: PhotoPayload[];
}

function getDriveClient() {
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'ENV tidak lengkap: butuh VITE_GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN'
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'https://developers.google.com/oauthplayground'
  );

  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

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

// Hitung jumlah foto existing di folder Drive (exclude JSON dan folder)
async function countExistingPhotos(
  drive: ReturnType<typeof google.drive>,
  parentId: string
): Promise<number> {
  const q = `'${parentId}' in parents and mimeType != 'application/vnd.google-apps.folder' and name != 'data-inspeksi.json' and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive', pageSize: 1000 });
  return res.data.files?.length ?? 0;
}

async function uploadPhoto(
  drive: ReturnType<typeof google.drive>,
  name: string,
  dataUrl: string,
  parentId: string
): Promise<void> {
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const payload = req.body as UploadPayload;
    if (!payload?.session?.id) {
      return res.status(400).json({ error: 'Payload tidak valid: session.id wajib ada' });
    }

    const drive = getDriveClient();
    const { session, photos } = payload;

    // Struktur folder: Aksara Inspect / [Klien] / [YYYY-MM-DD] / [Jenis] / [Unit-NoSeri]
    const rootFolderId = await getOrCreateFolder(drive, 'Aksara Inspect', null);
    const clientFolderId = await getOrCreateFolder(drive, session.clientName, rootFolderId);
    const dateStr = new Date(session.createdAt).toISOString().slice(0, 10);
    const dateFolderId = await getOrCreateFolder(drive, dateStr, clientFolderId);
    const typeFolderId = await getOrCreateFolder(drive, session.objectType, dateFolderId);
    const unitFolderName = `${session.unitData?.namaUnit || 'Unit'} - ${session.unitData?.nomorSeri || 'NoSeri'}`;
    const unitFolderId = await getOrCreateFolder(drive, unitFolderName, typeFolderId);

    // Upload JSON
    const dataPayload = JSON.stringify({
      id: session.id,
      clientName: session.clientName,
      objectType: session.objectType,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      unitData: session.unitData,
      totalPhotos: photos.length,
      inspectorEmail: session.inspectorEmail ?? null,
    }, null, 2);
    await upsertTextFile(drive, 'data-inspeksi.json', dataPayload, unitFolderId);

    // FIXED: Lanjutkan penomoran dari foto terakhir di Drive
    // Tidak hapus foto lama — setiap device hanya menambah foto baru
    const existingCount = await countExistingPhotos(drive, unitFolderId);
    for (let i = 0; i < photos.length; i++) {
      const photoNumber = existingCount + i + 1;
      const paddedNum = String(photoNumber).padStart(3, '0');
      const photoName = `foto-${paddedNum}.jpg`;
      await uploadPhoto(drive, photoName, photos[i].dataUrl, unitFolderId);
    }

    return res.status(200).json({
      success: true,
      folderId: unitFolderId,
      message: `Upload selesai: ${photos.length} foto`,
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload gagal';
    console.error('[api/upload] Error:', message);
    return res.status(500).json({ error: message });
  }
}