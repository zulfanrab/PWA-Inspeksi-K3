import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDriveClient } from '../driveClient.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { jobId } = req.query;

    if (!jobId) {
      return res.status(400).json({ error: 'Parameter query "jobId" wajib disertakan.' });
    }

    const drive = getDriveClient();
    const fileName = `_job_${jobId}.json`;
    const rootFolderId = process.env.ROOT_FOLDER_ID?.trim() || 'root';

    // Cari file status job di Drive
    const q = `name='${fileName}' and '${rootFolderId}' in parents and trashed=false`;
    const searchRes = await drive.files.list({
      q,
      fields: 'files(id)',
      spaces: 'drive',
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const fileId = searchRes.data.files?.[0]?.id;

    if (!fileId) {
      // Jika file belum ada, asumsikan statusnya masih memproses (karena penulisan synchronous instan)
      // Namun jika sudah lewat waktu tertentu, asumsikan gagal.
      return res.status(200).json({
        jobId,
        status: 'processing',
        progress: 40,
        message: 'Sedang memproses dokumen di generator...'
      });
    }

    // Unduh konten file status
    const downloadRes = await drive.files.get({
      fileId,
      alt: 'media',
      supportsAllDrives: true,
    }, { responseType: 'text' });

    const jobStatus = JSON.parse(downloadRes.data as string);

    // Hapus file job status di Drive secara background agar tidak menumpuk sampah
    drive.files.delete({ fileId, supportsAllDrives: true })
      .catch((err: any) => console.warn('[api/report/status] Gagal membersihkan file status job:', err.message));

    return res.status(200).json(jobStatus);

  } catch (error: any) {
    console.error('[api/report/status] Error:', error);
    return res.status(500).json({ error: error.message || 'Terjadi kesalahan saat memeriksa status pekerjaan.' });
  }
}
