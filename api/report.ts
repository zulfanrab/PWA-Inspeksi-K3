import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'stream';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import sizeOf from 'image-size';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { getDriveClient } from './driveClient.js';

// --- ROMAN MONTHS CONSTANT ---
const ROMAN_MONTHS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function getRomanMonth(month: number): string {
  return ROMAN_MONTHS[month] || String(month);
}

// --- HELPER FOR GENERATE ACTIONS ---
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

// --- SUB-HANDLERS ---

// 1. SEQUENCE
async function handleSequence(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
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
      const downloadRes = await drive.files.get({
        fileId,
        alt: 'media',
        supportsAllDrives: true,
      }, { responseType: 'json' });

      data = downloadRes.data as any;
      if (!data.counters) data.counters = {};
    } else {
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

    const typeKey = String(inspectionTypeCode).toUpperCase();
    const yearKey = String(year);

    if (!data.counters[typeKey]) {
      data.counters[typeKey] = {};
    }

    const currentNum = data.counters[typeKey][yearKey] || 0;
    nextNum = currentNum + 1;
    data.counters[typeKey][yearKey] = nextNum;

    try {
      await drive.files.update({
        fileId: fileId!,
        media: {
          mimeType: 'application/json',
          body: Readable.from(JSON.stringify(data, null, 2))
        }
      }, {
        headers: { 'If-Match': etag || '' }
      });

      success = true;
    } catch (err: any) {
      if (err.status === 412) {
        console.warn('[api/report] Tabrakan etag terdeteksi. Mengulangi proses...');
        retries--;
        await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 100));
      } else {
        throw err;
      }
    }
  }

  if (!success) {
    return res.status(409).json({ error: 'Gagal mengalokasikan nomor laporan karena tabrakan antrean konkuren.' });
  }

  const paddedNum = String(nextNum).padStart(3, '0');
  const romanMonth = getRomanMonth(month);
  const fullReportNumber = `${paddedNum}/ARP/${inspectionTypeCode}/${romanMonth}/${year}`;

  return res.status(200).json({
    success: true,
    number: nextNum,
    fullReportNumber
  });
}

// 2. NARRATIVE
async function handleNarrative(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { systemPrompt, prompts } = req.body;

  if (!systemPrompt || !prompts || typeof prompts !== 'object') {
    return res.status(400).json({ error: 'Payload tidak valid: systemPrompt dan prompts wajib ada.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(200).json({
      success: true,
      data: {
        executiveSummary: "(API Key Gemini belum diset. Silakan edit teks ini secara manual)",
        findingsNarrative: "(API Key Gemini belum diset. Silakan edit teks ini secara manual)",
        testResultsNarrative: "(API Key Gemini belum diset. Silakan edit teks ini secara manual)",
        recommendations: "(API Key Gemini belum diset. Silakan edit teks ini secara manual)",
        conclusion: "(API Key Gemini belum diset. Silakan edit teks ini secara manual)"
      }
    });
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const promptInstructions = `
Ikuti instruksi sistem berikut secara ketat:
---
SYSTEM PROMPT:
${systemPrompt}
---

Tolong buat narasi untuk 5 bagian laporan berikut dengan instruksi khusus untuk masing-masing bagian:

1. Executive Summary:
${prompts.executiveSummary}

2. Findings Narrative:
${prompts.findings}

3. Test Results Narrative:
${prompts.testResults}

4. Recommendations:
${prompts.recommendations}

5. Conclusion:
${prompts.conclusion}

Kembalikan respon Anda strictly dalam bentuk JSON sesuai dengan schema yang ditentukan.
`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: promptInstructions }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          executiveSummary: { type: SchemaType.STRING, description: 'Narasi ringkasan eksekutif' },
          findingsNarrative: { type: SchemaType.STRING, description: 'Narasi temuan visual' },
          testResultsNarrative: { type: SchemaType.STRING, description: 'Narasi hasil pengujian teknis' },
          recommendations: { type: SchemaType.STRING, description: 'Daftar rekomendasi perbaikan' },
          conclusion: { type: SchemaType.STRING, description: 'Narasi kesimpulan kelayakan' }
        },
        required: ['executiveSummary', 'findingsNarrative', 'testResultsNarrative', 'recommendations', 'conclusion']
      },
      temperature: 0.2,
    }
  });

  const responseText = result.response.text();
  const parsedNarrative = JSON.parse(responseText);

  return res.status(200).json({
    success: true,
    data: parsedNarrative
  });
}

// 3. GENERATE
async function handleGenerate(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { reportId, reportData } = req.body;

  if (!reportId || !reportData) {
    return res.status(400).json({ error: 'Payload tidak lengkap: reportId dan reportData wajib ada.' });
  }

  const drive = getDriveClient();
  const jobId = uuidv4();
  const rootFolderId = process.env.ROOT_FOLDER_ID?.trim() || 'root';

  const templatesFolderId = await getTemplatesFolderId(drive, rootFolderId);
  const templateFileId = await findTemplateFileId(drive, templatesFolderId, reportData.inspectionTypeCode);

  const templateRes = await drive.files.get({
    fileId: templateFileId,
    alt: 'media',
    supportsAllDrives: true
  }, { responseType: 'arraybuffer' });

  const templateBuffer = Buffer.from(templateRes.data as ArrayBuffer);

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
        const maxWidth = 550;
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

  const visualFaultsList: string[] = [];
  reportData.checklistData.components.forEach((c: any) => {
    c.items.forEach((item: any) => {
      if (item.result === 'KURANG' || item.result === 'TIDAK_ADA') {
        visualFaultsList.push(`- ${item.description}: ${item.result === 'KURANG' ? 'Kurang' : 'Tidak Ada'} (${item.remarks || '-'})`);
      }
    });
  });

  const templateData = {
    companyName: reportData.generalData.companyName,
    companyAddress: reportData.generalData.companyAddress,
    inspectionDate: reportData.generalData.inspectionDate,
    reportDate: reportData.generalData.reportDate,
    reportNumber: reportData.reportNumber,
    inspectorName: reportData.generalData.inspectorName,
    inspectorCertNumber: reportData.generalData.inspectorCertNumber,
    ...reportData.technicalData,
    components: reportData.checklistData.components,
    continuity: reportData.checklistData.continuity || [],
    overallResult: reportData.checklistData.overallResult,
    visualFaults: visualFaultsList.join('\n'),
    calculations: reportData.formulaResults.calculations,
    overallSafetyStatus: reportData.formulaResults.overallSafetyStatus,
    executiveSummary: reportData.aiNarrative.sections.executiveSummary,
    findingsNarrative: reportData.aiNarrative.sections.findingsNarrative,
    testResultsNarrative: reportData.aiNarrative.sections.testResultsNarrative,
    recommendations: reportData.aiNarrative.sections.recommendations,
    conclusion: reportData.aiNarrative.sections.conclusion,
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

  const clientFolderId = reportData.technicalData.driveFolderId || rootFolderId;
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
    message: 'Pembuatan laporan diproses secara instan.'
  });
}

// 4. STATUS
async function handleStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { jobId } = req.query;

  if (!jobId) {
    return res.status(400).json({ error: 'Parameter query "jobId" wajib disertakan.' });
  }

  const drive = getDriveClient();
  const fileName = `_job_${jobId}.json`;
  const rootFolderId = process.env.ROOT_FOLDER_ID?.trim() || 'root';

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
    return res.status(200).json({
      jobId,
      status: 'processing',
      progress: 40,
      message: 'Sedang memproses dokumen...'
    });
  }

  const downloadRes = await drive.files.get({
    fileId,
    alt: 'media',
    supportsAllDrives: true,
  }, { responseType: 'text' });

  const jobStatus = JSON.parse(downloadRes.data as string);

  drive.files.delete({ fileId, supportsAllDrives: true })
    .catch((err: any) => console.warn('[api/report] Gagal membersihkan file status job:', err.message));

  return res.status(200).json(jobStatus);
}

// 5. TEMPLATE
async function handleTemplate(req: VercelRequest, res: VercelResponse) {
  const drive = getDriveClient();
  const rootFolderId = process.env.ROOT_FOLDER_ID?.trim() || 'root';
  const templatesFolderId = await getTemplatesFolderId(drive, rootFolderId);

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
      templatesFolderId,
      templates: listRes.data.files || []
    });
  }

  if (req.method === 'POST') {
    const { typeCode, fileBase64, fileName } = req.body;

    if (!typeCode || !fileBase64) {
      return res.status(400).json({ error: 'Payload tidak lengkap: typeCode dan fileBase64 wajib ada.' });
    }

    const cleanTypeCode = String(typeCode).toUpperCase();
    const targetFileName = `Template_${cleanTypeCode}.docx`;

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

    const fileBuffer = Buffer.from(fileBase64.replace(/^data:.*?;base64,/, ''), 'base64');
    const media = {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: Readable.from(fileBuffer)
    };

    if (existingFileId) {
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
}

// --- MAIN ROUTER ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;

  try {
    if (action === 'sequence') {
      return await handleSequence(req, res);
    } else if (action === 'narrative') {
      return await handleNarrative(req, res);
    } else if (action === 'generate') {
      return await handleGenerate(req, res);
    } else if (action === 'status') {
      return await handleStatus(req, res);
    } else if (action === 'template') {
      return await handleTemplate(req, res);
    } else {
      return res.status(400).json({ error: `Action "${action}" tidak valid.` });
    }
  } catch (error: any) {
    console.error(`[api/report] Error in action ${action}:`, error);
    return res.status(500).json({ error: error.message || 'Terjadi kesalahan sistem internal.' });
  }
}
