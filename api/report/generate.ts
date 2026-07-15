import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'stream';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import sizeOf from 'image-size';
import { v4 as uuidv4 } from 'uuid';
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

// Helper to find the Template file by typeCode
async function findTemplateFileId(drive: any, templatesFolderId: string, typeCode: string): Promise<string> {
  const fileName = `Template_${typeCode.toUpperCase()}.docx`;
  const q = `name='${fileName}' and '${templatesFolderId}' in parents and trashed=false`;
  const res = await drive.files.list({ q, fields: 'files(id)', spaces: 'drive' });
  const fileId = res.data.files?.[0]?.id;
  if (!fileId) {
    throw new Error(`Template file "${fileName}" tidak ditemukan di folder 'Aksara Inspect/Templates'. Silakan unggah terlebih dahulu.`);
  }
  return fileId;
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
    const { reportId, reportData } = req.body;

    if (!reportId || !reportData) {
      return res.status(400).json({ error: 'Payload tidak lengkap: reportId dan reportData wajib ada.' });
    }

    const drive = getDriveClient();
    const jobId = uuidv4();

    // 1. Dapatkan Root Folder ID
    const rootFolderId = process.env.ROOT_FOLDER_ID?.trim() || 'root';

    // 2. Cari Template File ID
    const templatesFolderId = await getTemplatesFolderId(drive, rootFolderId);
    const templateFileId = await findTemplateFileId(drive, templatesFolderId, reportData.inspectionTypeCode);

    // 3. Unduh Template .docx
    const templateRes = await drive.files.get({
      fileId: templateFileId,
      alt: 'media',
      supportsAllDrives: true
    }, { responseType: 'arraybuffer' });

    const templateBuffer = Buffer.from(templateRes.data as ArrayBuffer);

    // 4. Proses dengan Docxtemplater & ImageModule
    const zip = new PizZip(templateBuffer);
    
    const imageOptions = {
      centered: false,
      getImage(tagValue: string) {
        const base64Data = tagValue.replace(/^data:image\/\w+;base64,/, '');
        return Buffer.from(base64Data, 'base64');
      },
      getSize(imgBuffer: Buffer) {
        try {
          const dimensions = sizeOf(imgBuffer);
          const maxWidth = 550; // Lebar halaman Word standar
          const maxHeight = 350;
          let width = dimensions.width || 300;
          let height = dimensions.height || 200;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
          return [width, height];
        } catch (e) {
          return [300, 200];
        }
      }
    };

    const doc = new Docxtemplater(zip, {
      modules: [new ImageModule(imageOptions)],
      paragraphLoop: true,
      linebreaks: true
    });

    // Susun data pengganti tag template
    const visualFaultsList: string[] = [];
    reportData.checklistData.components.forEach((c: any) => {
      c.items.forEach((item: any) => {
        if (item.result === 'KURANG' || item.result === 'TIDAK_ADA') {
          visualFaultsList.push(`- ${item.description}: ${item.result === 'KURANG' ? 'Kurang' : 'Tidak Ada'} (${item.remarks || '-'})`);
        }
      });
    });

    const templateData = {
      // General
      companyName: reportData.generalData.companyName,
      companyAddress: reportData.generalData.companyAddress,
      inspectionDate: reportData.generalData.inspectionDate,
      reportDate: reportData.generalData.reportDate,
      reportNumber: reportData.reportNumber,
      inspectorName: reportData.generalData.inspectorName,
      inspectorCertNumber: reportData.generalData.inspectorCertNumber,
      
      // Technical
      ...reportData.technicalData,
      
      // Checklist components
      components: reportData.checklistData.components,
      overallResult: reportData.checklistData.overallResult,
      visualFaults: visualFaultsList.join('\n'),

      // Calculations / Formulas
      calculations: reportData.formulaResults.calculations,
      overallSafetyStatus: reportData.formulaResults.overallSafetyStatus,

      // AI Narrative Sections
      executiveSummary: reportData.aiNarrative.sections.executiveSummary,
      findingsNarrative: reportData.aiNarrative.sections.findingsNarrative,
      testResultsNarrative: reportData.aiNarrative.sections.testResultsNarrative,
      recommendations: reportData.aiNarrative.sections.recommendations,
      conclusion: reportData.aiNarrative.sections.conclusion,

      // Photos
      photos: reportData.photoDocumentation.photos.map((p: any) => ({
        image: p.dataUrl,
        caption: p.caption
      }))
    };

    doc.render(templateData);

    const outputBuffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE'
    });

    // 5. Cari target folder Klien
    const clientFolderId = reportData.technicalData.driveFolderId || rootFolderId;

    // 6. Unggah hasil akhir ke Drive
    const reportFileName = `Laporan_${reportData.inspectionTypeCode}_${reportData.reportNumber.replace(/\//g, '_')}.docx`;
    const uploadRes = await drive.files.create({
      requestBody: {
        name: reportFileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        parents: [clientFolderId]
      },
      media: {
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        body: Readable.from(outputBuffer)
      },
      fields: 'id',
      supportsAllDrives: true,
    });

    const fileId = uploadRes.data.id;

    // 7. Simpan status pekerjaan di Google Drive (Database-free job tracking)
    const jobFileName = `_job_${jobId}.json`;
    const jobContent = {
      jobId,
      status: 'completed',
      progress: 100,
      outputDriveFileId: fileId,
      createdAt: new Date().toISOString()
    };

    await drive.files.create({
      requestBody: {
        name: jobFileName,
        mimeType: 'application/json',
        parents: [rootFolderId]
      },
      media: {
        mimeType: 'application/json',
        body: Readable.from(JSON.stringify(jobContent))
      },
      supportsAllDrives: true,
    });

    return res.status(200).json({
      success: true,
      jobId,
      message: 'Pembuatan laporan dijadwalkan dan diproses secara instan.'
    });

  } catch (error: any) {
    console.error('[api/report/generate] Error:', error);
    return res.status(500).json({ error: error.message || 'Terjadi kesalahan sistem saat membuat dokumen.' });
  }
}
