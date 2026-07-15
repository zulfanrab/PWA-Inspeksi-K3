import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'stream';
import { getDriveClient } from '../driveClient.js';

// Helper to find or create the Templates folder
async function getTemplatesFolderId(drive: any, rootFolderId: string): Promise<string> {
  const q = `name='Templates' and mimeType='application/vnd.google-apps.folder' and '${rootFolderId}' in parents and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive' });
  const existingId = res.data.files?.[0]?.id;
  if (existingId) return existingId;

  const created = await drive.files.create({
    requestBody: { name: 'Templates', mimeType: 'application/vnd.google-apps.folder', parents: [rootFolderId] },
    fields: 'id',
    supportsAllDrives: true,
  });
  return created.data.id!;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const drive = getDriveClient();
    const rootFolderId = process.env.ROOT_FOLDER_ID?.trim() || 'root';
    const templatesFolderId = await getTemplatesFolderId(drive, rootFolderId);

    // GET: List all templates in the Templates folder
    if (req.method === 'GET') {
      const q = `'${templatesFolderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed=false`;
      const listRes = await drive.files.list({
        q,
        fields: 'files(id, name, createdTime, size)',
        spaces: 'drive',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      return res.status(200).json({
        success: true,
        templates: listRes.data.files || []
      });
    }

    // POST: Upload template file
    if (req.method === 'POST') {
      const { typeCode, fileBase64, fileName } = req.body;

      if (!typeCode || !fileBase64) {
        return res.status(400).json({ error: 'Payload tidak lengkap: typeCode dan fileBase64 wajib ada.' });
      }

      const cleanTypeCode = String(typeCode).toUpperCase();
      const targetFileName = `Template_${cleanTypeCode}.docx`;

      // Cari apakah file template untuk tipe ini sudah ada
      const q = `name='${targetFileName}' and '${templatesFolderId}' in parents and trashed=false`;
      const searchRes = await drive.files.list({
        q,
        fields: 'files(id)',
        spaces: 'drive',
        pageSize: 1,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const existingFileId = searchRes.data.files?.[0]?.id;

      // Decode base64
      const fileBuffer = Buffer.from(fileBase64.replace(/^data:.*?;base64,/, ''), 'base64');
      const media = {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        body: Readable.from(fileBuffer)
      };

      if (existingFileId) {
        // Update template existing
        await drive.files.update({
          fileId: existingFileId,
          requestBody: { name: targetFileName },
          media,
          supportsAllDrives: true,
        });
        
        return res.status(200).json({
          success: true,
          fileId: existingFileId,
          message: `Template ${targetFileName} berhasil diperbarui.`
        });
      } else {
        // Buat file template baru
        const createRes = await drive.files.create({
          requestBody: {
            name: targetFileName,
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            parents: [templatesFolderId]
          },
          media,
          fields: 'id',
          supportsAllDrives: true,
        });

        return res.status(200).json({
          success: true,
          fileId: createRes.data.id,
          message: `Template ${targetFileName} berhasil dibuat.`
        });
      }
    }

  } catch (error: any) {
    console.error('[api/report/template] Error:', error);
    return res.status(500).json({ error: error.message || 'Terjadi kesalahan sistem internal.' });
  }
}
