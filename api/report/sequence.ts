import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'stream';
import { getDriveClient } from '../driveClient.js';

const ROMAN_MONTHS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function getRomanMonth(month: number): string {
  return ROMAN_MONTHS[month] || String(month);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { inspectionTypeCode, year, month } = req.body;

    if (!inspectionTypeCode || !year || !month) {
      return res.status(400).json({ error: 'Payload tidak lengkap: inspectionTypeCode, year, dan month wajib ada.' });
    }

    const drive = getDriveClient();
    const fileName = '_sequence_counter.json';
    const rootFolderId = process.env.ROOT_FOLDER_ID?.trim() || 'root';

    let retries = 5;
    let success = false;
    let nextNum = 1;

    while (retries > 0 && !success) {
      // 1. Cari file sequence_counter di Drive
      const q = `name='${fileName}' and '${rootFolderId}' in parents and trashed=false`;
      const searchRes = await drive.files.list({
        q,
        fields: 'files(id, etag)',
        spaces: 'drive',
        pageSize: 1,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      const fileObj = searchRes.data.files?.[0] as any;
      let fileId = fileObj?.id;
      let etag = fileObj?.etag;
      let data: { counters: Record<string, Record<string, number>> } = { counters: {} };

      if (fileId) {
        // 2. Jika file ada, unduh kontennya
        const downloadRes = await drive.files.get({
          fileId,
          alt: 'media',
          supportsAllDrives: true,
        }, { responseType: 'json' });

        data = downloadRes.data as any;
        if (!data.counters) {
          data.counters = {};
        }
      } else {
        // 3. Jika file tidak ada, buat baru
        const createRes = await drive.files.create({
          requestBody: {
            name: fileName,
            mimeType: 'application/json',
            parents: [rootFolderId]
          },
          media: {
            mimeType: 'application/json',
            body: Readable.from(JSON.stringify(data))
          },
          fields: 'id, etag',
          supportsAllDrives: true,
        });

        const createData = createRes.data as any;
        fileId = createData.id;
        etag = createData.etag;
      }

      // 4. Hitung nomor urut berikutnya
      const typeKey = String(inspectionTypeCode).toUpperCase();
      const yearKey = String(year);

      if (!data.counters[typeKey]) {
        data.counters[typeKey] = {};
      }

      const currentNum = data.counters[typeKey][yearKey] || 0;
      nextNum = currentNum + 1;
      data.counters[typeKey][yearKey] = nextNum;

      // 5. Update file kembali dengan Optimistic Locking (etag check)
      try {
        await drive.files.update({
          fileId: fileId!,
          media: {
            mimeType: 'application/json',
            body: Readable.from(JSON.stringify(data, null, 2))
          }
        }, {
          headers: {
            'If-Match': etag || ''
          }
        });

        success = true;
      } catch (err: any) {
        if (err.status === 412) {
          // Precondition failed (tabrakan), kurangi retry, lalu coba lagi
          console.warn('[api/report/sequence] Tabrakan etag terdeteksi. Mengulangi proses...');
          retries--;
          await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 100)); // sleep acak
        } else {
          throw err;
        }
      }
    }

    if (!success) {
      return res.status(409).json({ error: 'Gagal mengalokasikan nomor laporan karena tabrakan antrean konkuren yang terlalu tinggi.' });
    }

    const paddedNum = String(nextNum).padStart(3, '0');
    const romanMonth = getRomanMonth(month);
    const fullReportNumber = `${paddedNum}/ARP/${inspectionTypeCode}/${romanMonth}/${year}`;

    return res.status(200).json({
      success: true,
      number: nextNum,
      fullReportNumber
    });

  } catch (error: any) {
    console.error('[api/report/sequence] Error:', error);
    return res.status(500).json({ error: error.message || 'Terjadi kesalahan sistem internal.' });
  }
}
