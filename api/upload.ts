// api/upload.ts
// FIXED: Service Account upload ke Drive-nya sendiri
// FIXED: Folder root otomatis di-share ke owner email saat pertama dibuat
// Sehingga owner bisa lihat semua data di Google Drive mereka

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

// ─── DRIVE CLIENT ────────────────────────────────────────────────────────────

function getDriveClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!email || !privateKey) {
    throw new Error('Service Account env vars tidak ditemukan.');
  }

  const auth = new google.auth.JWT({
    email,
    key: privateKey,
    // FIXED: Pakai drive scope penuh agar bisa manage permissions
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  return google.drive({ version: 'v3', auth });
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

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

  // FIXED: Kalau ada parentId, pakai. Kalau tidak, buat di root service account
  if (parentId) {
    requestBody.parents = [parentId];
  }

  const res = await drive.files.create({
    requestBody,
    fields: 'id',
  });

  return res.data.id!;
}

// FIXED: Share folder ke owner email supaya owner bisa lihat di Drive mereka
async function shareFolderToOwner(
  drive: ReturnType<typeof google.drive>,
  folderId: string,
  ownerEmail: string
): Promise<void> {
  try {
    // Cek apakah sudah di-share
    const permsRes = await drive.permissions.list({
      fileId: folderId,
      fields: 'permissions(id,emailAddress,role)',
    });

    const alreadyShared = permsRes.data.permissions?.some(
      (p) => p.emailAddress === ownerEmail
    );

    if (alreadyShared) return;

    // Share sebagai reader (owner bisa lihat tapi tidak bisa hapus)
    await drive.permissions.create({
      fileId: folderId,
      requestBody: {
        type: 'user',
        role: 'writer', // writer agar owner bisa download & manage
        emailAddress: ownerEmail,
      },
      // Jangan kirim notif email setiap upload
      sendNotificationEmail: false,
    });
  } catch (err) {
    // Kalau gagal share, jangan crash — upload tetap jalan
    console.warn('[upload] Gagal share folder ke owner:', err);
  }
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

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

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

    // FIXED: Email owner dari env — folder akan di-share ke sini
    const ownerEmail = process.env.VITE_OWNER_EMAIL || process.env.OWNER_EMAIL || '';

    const { session, photos } = payload;

    // FIXED: Buat folder root "Aksara Inspect" di Drive service account
    // parentId = null → buat di root service account (bukan Drive owner)
    const rootFolderId = await getOrCreateFolder(drive, 'Aksara Inspect', null);

    // FIXED: Share folder root ke owner email (hanya sekali, idempotent)
    if (ownerEmail) {
      await shareFolderToOwner(drive, rootFolderId, ownerEmail);
    }

    // Buat struktur folder: [Klien] / [YYYY-MM-DD] / [Jenis] / [Unit-NoSeri]
    const clientFolderId = await getOrCreateFolder(drive, session.clientName, rootFolderId);
    const dateStr = new Date(session.createdAt).toISOString().slice(0, 10);
    const dateFolderId = await getOrCreateFolder(drive, dateStr, clientFolderId);
    const typeFolderId = await getOrCreateFolder(drive, session.objectType, dateFolderId);
    const unitFolderName = `${session.unitData?.namaUnit || 'Unit'} - ${session.unitData?.nomorSeri || 'NoSeri'}`;
    const unitFolderId = await getOrCreateFolder(drive, unitFolderName, typeFolderId);

    // Upload data-inspeksi.json
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

    // Upload setiap foto
    for (const photo of photos) {
      await uploadPhoto(drive, photo.name, photo.dataUrl, unitFolderId);
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