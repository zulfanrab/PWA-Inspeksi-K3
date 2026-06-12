// api/upload.ts
// Tugas: Membuat struktur folder dan menyimpan metadata JSON ke Google Drive.
// Foto di-handle terpisah oleh api/upload-photo.ts untuk menghindari 413.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'stream';
import { getDriveClient } from './driveClient';

// ─── TYPES ────────────────────────────────────────────────────────────────────

type DriveClient = ReturnType<typeof getDriveClient>;

interface UnitData {
  namaUnit?: string;
  nomorSeri?: string;
  [key: string]: unknown;
}

interface InspectionSession {
  id: string;
  clientName: string;
  objectType: string;
  createdAt: string;
  updatedAt?: string;
  unitData?: UnitData;
  totalPhotos?: number;
  inspectorEmail?: string;
}

interface UploadRequestBody {
  inspectionData?: InspectionSession;
  session?: InspectionSession;
  existingFolderId?: string;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const OBJECT_TYPE_LABELS: Record<string, string> = {
  Angkur: 'Safety Anchor',
  PAA: 'Pesawat Angkat & Angkut',
  PUBT: 'Pesawat Uap & Bejana Tekan',
  PTP: 'Pesawat Tenaga & Produksi',
  Listrik: 'Instalasi Listrik',
  'Penyalur Petir': 'Instalasi Penyalur Petir',
  Lift: 'Elevator & Eskalator',
  'Proteksi Kebakaran': 'Proteksi Kebakaran',
};

// ─── DRIVE HELPERS ────────────────────────────────────────────────────────────

/**
 * Escape single quote untuk query Drive API.
 * Drive query pakai sintaks berbeda dari SQL — backslash escape, bukan doubling.
 */
function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/**
 * Cari folder berdasarkan nama dan parent.
 * Return ID folder jika ditemukan, null jika tidak ada.
 */
async function findFolder(
  drive: DriveClient,
  name: string,
  parentId: string | null
): Promise<string | null> {
  const parentClause = parentId
    ? `'${escapeDriveQuery(parentId)}' in parents`
    : `'root' in parents`;

  const q = [
    `name='${escapeDriveQuery(name)}'`,
    `mimeType='application/vnd.google-apps.folder'`,
    parentClause,
    `trashed=false`,
  ].join(' and ');

  const response = await drive.files.list({
    q,
    fields: 'files(id)',
    spaces: 'drive',
    pageSize: 1, // Kita hanya butuh satu hasil, jangan waste quota
  });

  return response.data.files?.[0]?.id ?? null;
}

/**
 * Ambil folder yang ada atau buat baru jika belum ada.
 * Idempotent — aman dipanggil berkali-kali dengan argumen sama.
 */
async function getOrCreateFolder(
  drive: DriveClient,
  name: string,
  parentId: string | null
): Promise<string> {
  const existingId = await findFolder(drive, name, parentId);
  if (existingId) {
    console.log(`[getOrCreateFolder] Found: "${name}" → ${existingId}`);
    return existingId;
  }

  const requestBody: Record<string, unknown> = {
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) requestBody.parents = [parentId];

  const response = await drive.files.create({
    requestBody,
    fields: 'id',
  });

  const newId = response.data.id;
  if (!newId) throw new Error(`[getOrCreateFolder] Drive tidak mengembalikan ID untuk folder "${name}"`);

  console.log(`[getOrCreateFolder] Created: "${name}" → ${newId}`);
  return newId;
}

/**
 * Buat atau update file teks (JSON) di dalam folder Drive.
 *
 * FIX KRITIS: Saat `files.update`, jangan masukkan `mimeType` ke `requestBody`.
 * Drive API v3 menolak ini dengan 400 Bad Request.
 * `mimeType` hanya boleh ada di object `media`.
 */
async function upsertTextFile(
  drive: DriveClient,
  fileName: string,
  content: string,
  parentId: string
): Promise<void> {
  const q = [
    `name='${escapeDriveQuery(fileName)}'`,
    `'${escapeDriveQuery(parentId)}' in parents`,
    `trashed=false`,
  ].join(' and ');

  const listResponse = await drive.files.list({
    q,
    fields: 'files(id)',
    spaces: 'drive',
    pageSize: 1,
  });

  const existingId = listResponse.data.files?.[0]?.id;

  // FIX: Gunakan Buffer agar stream tidak corrupt saat flush
  const contentBuffer = Buffer.from(content, 'utf-8');
  const media = {
    mimeType: 'application/json',
    body: Readable.from(contentBuffer),
  };

  if (existingId) {
    // FIX UTAMA 400: Saat update, requestBody TIDAK boleh mengandung mimeType.
    // mimeType hanya dikirim lewat object `media`.
    await drive.files.update({
      fileId: existingId,
      requestBody: { name: fileName },
      media,
    });
    console.log(`[upsertTextFile] Updated: "${fileName}" (${existingId})`);
  } else {
    await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: 'application/json',
        parents: [parentId],
      },
      media,
      fields: 'id',
    });
    console.log(`[upsertTextFile] Created: "${fileName}"`);
  }
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body as UploadRequestBody;
    const session = body.inspectionData ?? body.session;

    if (!session?.id || !session?.clientName || !session?.objectType) {
      return res.status(400).json({
        error: 'Payload tidak valid: id, clientName, dan objectType wajib ada.',
      });
    }

    const drive = getDriveClient();

    // ── Resolusi Folder ───────────────────────────────────────────────────────
    let unitFolderId: string;

    if (body.existingFolderId) {
      // Mode edit: folder sudah ada, tidak perlu buat ulang
      unitFolderId = body.existingFolderId;
      console.log(`[upload] Mode edit, menggunakan folder: ${unitFolderId}`);
    } else {
      // Mode baru: buat struktur folder lengkap
      const rootFolderId =
        process.env.ROOT_FOLDER_ID?.trim() ||
        (await getOrCreateFolder(drive, 'Aksara Inspect', null));

      console.log(`[upload] Root folder: ${rootFolderId}`);

      const clientFolderId = await getOrCreateFolder(drive, session.clientName, rootFolderId);

      // Format tanggal YYYY-MM-DD pakai locale 'sv-SE' (ISO-like, konsisten cross-timezone)
      const dateStr = new Date(session.createdAt).toLocaleDateString('sv-SE', {
        timeZone: 'Asia/Jakarta',
      });
      const dateFolderId = await getOrCreateFolder(drive, dateStr, clientFolderId);

      const typeFolderName = OBJECT_TYPE_LABELS[session.objectType] ?? session.objectType;
      const typeFolderId = await getOrCreateFolder(drive, typeFolderName, dateFolderId);

      const namaUnit = session.unitData?.namaUnit?.trim() || 'Unit';
      const nomorSeri = session.unitData?.nomorSeri?.trim() || 'NoSeri';
      const unitFolderName = `${namaUnit} - ${nomorSeri}`;

      unitFolderId = await getOrCreateFolder(drive, unitFolderName, typeFolderId);
    }

    // ── Upload Metadata JSON ──────────────────────────────────────────────────
    const dataPayload = JSON.stringify(
      {
        id: session.id,
        clientName: session.clientName,
        objectType: session.objectType,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt ?? new Date().toISOString(),
        unitData: session.unitData ?? {},
        totalPhotos: session.totalPhotos ?? 0,
        inspectorEmail: session.inspectorEmail ?? null,
      },
      null,
      2
    );

    await upsertTextFile(drive, 'data-inspeksi.json', dataPayload, unitFolderId);

    return res.status(200).json({
      success: true,
      folderId: unitFolderId,
      message: 'Folder dan metadata JSON berhasil dibuat.',
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload meta gagal';
    // Log detail Google API error jika ada
    const googleDetail = (error as any)?.response?.data ?? null;

    console.error('[api/upload] Error:', message);
    if (googleDetail) {
      console.error('[api/upload] Google API detail:', JSON.stringify(googleDetail));
    }

    return res.status(500).json({
      error: message,
      ...(process.env.NODE_ENV !== 'production' && googleDetail
        ? { googleError: googleDetail }
        : {}),
    });
  }
}