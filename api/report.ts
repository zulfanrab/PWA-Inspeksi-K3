import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Readable } from 'stream';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import ImageModule from 'docxtemplater-image-module-free';
import sizeOf from 'image-size';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import { getDriveClient, getDriveAccessToken } from './driveClient.js';

// --- ROMAN MONTHS CONSTANT ---
const ROMAN_MONTHS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

function getRomanMonth(month: number): string {
  return ROMAN_MONTHS[month] || String(month);
}

const TYPE_CODE_RE = /^[A-Z0-9_-]{1,20}$/;
const JOB_ID_RE = /^[A-Za-z0-9_-]{4,80}$/;
const DRIVE_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;

function sanitizeTypeCode(raw: unknown): string {
  const code = String(raw || '').trim().toUpperCase();
  if (!TYPE_CODE_RE.test(code)) {
    throw new Error('Kode jenis laporan tidak valid.');
  }
  return code;
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
  const cleanCode = sanitizeTypeCode(typeCode);
  const fileName = `Template_${cleanCode}.docx`;
  const q = `name='${fileName}' and '${templatesFolderId}' in parents and trashed=false`;
  const res = await drive.files.list({
    q,
    fields: 'files(id, modifiedTime)',
    orderBy: 'modifiedTime desc',
    spaces: 'drive',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
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
      await drive.files.update(
        {
          fileId: fileId!,
          supportsAllDrives: true,
          media: {
            mimeType: 'application/json',
            body: Readable.from(JSON.stringify(data, null, 2))
          }
        },
        etag ? { headers: { 'If-Match': etag } } : undefined
      );

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

function parseGeminiJson(rawText: string): any {
  const cleaned = String(rawText || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

async function generateContentWithRetry(
  genAI: GoogleGenerativeAI,
  modelCandidates: string[],
  requestConfig: any
) {
  let lastError: any;
  const startedAt = Date.now();
  const TOTAL_BUDGET_MS = 8500;

  for (let i = 0; i < modelCandidates.length; i++) {
    const modelName = modelCandidates[i];
    const hasFallbackNext = i < modelCandidates.length - 1;
    const budgetLeft = TOTAL_BUDGET_MS - (Date.now() - startedAt);
    if (budgetLeft <= 1200) break;

    const model = genAI.getGenerativeModel({ model: modelName });
    for (let attempt = 0; attempt < 2; attempt++) {
      const remainingMs = TOTAL_BUDGET_MS - (Date.now() - startedAt);
      if (remainingMs <= 1200) break;
      const attemptTimeout = hasFallbackNext ? Math.min(4800, remainingMs) : remainingMs;
      try {
        return await model.generateContent(requestConfig, { timeout: attemptTimeout });
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || '').toLowerCase();
        const isNotFound = err?.status === 404 || msg.includes('404') || msg.includes('no longer available');
        if (isNotFound) {
          break;
        }
        const isTransient =
          err?.status === 503 ||
          err?.status === 429 ||
          err?.status === 500 ||
          msg.includes('503') ||
          msg.includes('429') ||
          msg.includes('high demand') ||
          msg.includes('overloaded') ||
          msg.includes('resource_exhausted') ||
          msg.includes('unavailable') ||
          msg.includes('timeout') ||
          msg.includes('abort');

        const afterErrLeft = TOTAL_BUDGET_MS - (Date.now() - startedAt);
        // Jika ada fallback model dan waktu mepet, langsung lompat ke model fallback agar cepat
        if (isTransient && attempt === 0 && afterErrLeft > 4200 && !hasFallbackNext) {
          await new Promise((r) => setTimeout(r, 400));
          continue;
        }
        if (isTransient && hasFallbackNext) {
          break;
        }
        if (isTransient && attempt === 0 && afterErrLeft > 3000) {
          await new Promise((r) => setTimeout(r, 350));
          continue;
        }
        break;
      }
    }
  }
  const lastMsg = String(lastError?.message || '').toLowerCase();
  if (lastError?.status === 503 || lastError?.status === 429 || lastMsg.includes('503') || lastMsg.includes('429') || lastMsg.includes('high demand')) {
    throw new Error('Server AI Gemini sedang padat sementara (503/429). Silakan tunggu beberapa detik lalu coba lagi.');
  }
  throw lastError;
}

// 2. NARRATIVE
async function handleNarrative(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { systemPrompt, prompts, modelTier } = req.body;

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
  const modelCandidates = modelTier === 'pro'
    ? ['gemini-2.5-pro', 'gemini-2.5-flash']
    : ['gemini-2.5-flash', 'gemini-2.5-pro'];

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

  const requestConfig: any = {
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
  };

  const result = await generateContentWithRetry(genAI, modelCandidates, requestConfig);
  const parsedNarrative = parseGeminiJson(result.response.text());

  return res.status(200).json({
    success: true,
    data: parsedNarrative
  });
}

function formatIndonesianDayAndDate(dateStr?: string): { day: string; formatted: string } {
  if (!dateStr) return { day: '', formatted: '' };
  const raw = String(dateStr).trim();
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  const buildFromParts = (yyyy: number, mm: number, dd: number) => {
    const utcNoon = new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0));
    if (
      isNaN(utcNoon.getTime()) ||
      utcNoon.getUTCFullYear() !== yyyy ||
      utcNoon.getUTCMonth() !== mm - 1 ||
      utcNoon.getUTCDate() !== dd
    ) {
      return { day: '', formatted: raw };
    }
    return {
      day: days[utcNoon.getUTCDay()] || '',
      formatted: `${dd} ${months[mm - 1]} ${yyyy}`
    };
  };

  // Dukung DD/MM/YYYY atau DD-MM-YYYY
  const dmyMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  // Dukung YYYY-MM-DD
  const ymdMatch = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  // Dukung "12 November 2026"
  const idTextMatch = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);

  if (dmyMatch) {
    return buildFromParts(Number(dmyMatch[3]), Number(dmyMatch[2]), Number(dmyMatch[1]));
  }
  if (ymdMatch) {
    return buildFromParts(Number(ymdMatch[1]), Number(ymdMatch[2]), Number(ymdMatch[3]));
  }
  if (idTextMatch) {
    const mIdx = months.findIndex((m) => m.toLowerCase() === idTextMatch[2].toLowerCase());
    if (mIdx >= 0) {
      return buildFromParts(Number(idTextMatch[3]), mIdx + 1, Number(idTextMatch[1]));
    }
  }

  const parsed = new Date(raw.includes('T') ? raw : `${raw}T12:00:00Z`);
  if (isNaN(parsed.getTime())) return { day: '', formatted: raw };

  const jkt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
  const parts = jkt.split('-').map(Number);
  if (parts.length === 3 && !parts.some(isNaN)) {
    return buildFromParts(parts[0], parts[1], parts[2]);
  }
  return { day: '', formatted: raw };
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

  // Jika user mengunggah lampiran BAP namun template Word belum memuat tag {#bapAttachments},
  // sisipkan blok {#bapAttachments}{%image}{/bapAttachments} otomatis tepat sebelum {%skpPerusahaanImage}
  const hasBapUploads =
    Array.isArray(reportData.bapAttachments) &&
    reportData.bapAttachments.some((att: any) => typeof att?.image === 'string' && att.image.includes('base64,'));
  if (hasBapUploads) {
    const docXmlFile = zip.file('word/document.xml');
    if (docXmlFile) {
      const xml = docXmlFile.asText();
      const plainText = xml.replace(/<[^>]+>/g, '');
      if (!plainText.includes('bapAttachments')) {
        const targetAnchor = plainText.includes('skpPerusahaanImage')
          ? 'skpPerusahaanImage'
          : plainText.includes('skpAhliImage')
          ? 'skpAhliImage'
          : null;
        if (targetAnchor) {
          const pMatches = xml.matchAll(/<w:p(?:\s[^>]*)?>(?:(?!<w:p(?:\s|>))[\s\S])*?<\/w:p>/g);
          for (const m of pMatches) {
            if (m.index !== undefined && m[0].replace(/<[^>]+>/g, '').includes(targetAnchor)) {
              const bapXml =
                '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{#bapAttachments}</w:t></w:r></w:p>' +
                '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{%image}</w:t></w:r></w:p>' +
                '<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>{/bapAttachments}</w:t></w:r></w:p>';
              zip.file('word/document.xml', xml.slice(0, m.index) + bapXml + xml.slice(m.index));
              break;
            }
          }
        }
      }
    }
  }
  
  const imageOptions = {
    centered: false,
    getImage(tagValue: string) {
      if (!tagValue || typeof tagValue !== 'string' || !tagValue.includes('base64,')) {
        return false as any;
      }
      const base64Data = tagValue.replace(/^data:image\/\w+;base64,/, '');
      if (!base64Data) return false as any;
      return Buffer.from(base64Data, 'base64');
    },
    getSize(imgBuffer: Buffer, _tagValue: string, tagName?: string) {
      if (!imgBuffer || !Buffer.isBuffer(imgBuffer) || imgBuffer.length === 0) {
        return [1, 1];
      }
      try {
        const dimensions = sizeOf(imgBuffer);
        let maxWidth = 550;
        let maxHeight = 350;

        if (tagName === 'img1' || tagName === 'img2' || tagName === 'img3') {
          // Area efektif Folio margin 1 inci = ~165 mm (~55 mm/kolom); 190x215 px (~50.2x56.9 mm) agar foto portrait & landscape tampil besar
          maxWidth = 190;
          maxHeight = 215;
        } else if (tagName === 'jointPhoto') {
          // Foto bersama dibuat jauh lebih besar & menonjol dibanding foto grid 3 kolom
          maxWidth = 540;
          maxHeight = 420;
        } else if (
          tagName === 'skpAhliImage' ||
          tagName === 'skpPerusahaanImage' ||
          tagName === 'bapImage' ||
          tagName === 'image'
        ) {
          // Berlaku untuk lampiran halaman penuh (BAP, SKP, & Lampiran Tambahan Akhir) pada semua jenis laporan
          maxWidth = 560;
          maxHeight = 840;
        }

        let width = dimensions.width || maxWidth;
        let height = dimensions.height || maxHeight;

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
        return [165, 125];
      }
    }
  };

  const doc = new Docxtemplater(zip, {
    modules: [new ImageModule(imageOptions)],
    paragraphLoop: true,
    linebreaks: true,
    nullGetter() {
      return '';
    }
  });

  const visualFaultsList: string[] = [];
  (reportData.checklistData?.components || []).forEach((c: any) => {
    (c.items || []).forEach((item: any) => {
      if (item.result === 'KURANG' || item.result === 'TIDAK_ADA' || item.result === 'TIDAK_BAIK') {
        visualFaultsList.push(`- ${item.description}: ${item.result} (${item.remarks || '-'})`);
      }
    });
  });

  const inspDateInfo = formatIndonesianDayAndDate(reportData.generalData?.inspectionDate);
  const repDateInfo = formatIndonesianDayAndDate(reportData.generalData?.reportDate);

  const rawPhotos = Array.isArray(reportData.photoDocumentation?.photos) ? reportData.photoDocumentation.photos : [];
  const photoRows: Array<Record<string, string>> = [];
  for (let i = 0; i < rawPhotos.length; i += 3) {
    const p1 = rawPhotos[i];
    const p2 = rawPhotos[i + 1];
    const p3 = rawPhotos[i + 2];
    photoRows.push({
      img1: p1?.dataUrl || '',
      caption1: p1?.caption || '',
      img2: p2?.dataUrl || '',
      caption2: p2?.caption || '',
      img3: p3?.dataUrl || '',
      caption3: p3?.caption || '',
    });
  }

  const sections = reportData.aiNarrative?.sections || {};
  const rawTech = reportData.technicalData || {};
  const sanitizedTech = Object.fromEntries(
    Object.entries(rawTech).filter(([, v]) => v !== undefined && v !== null)
  );
  const typeCodeUpper = String(reportData.inspectionTypeCode || '').toUpperCase();
  const isIl = typeCodeUpper === 'IL';

  const strVal = (v: any, fallback: string) =>
    v !== undefined && v !== null && String(v).trim() !== '' ? String(v) : fallback;

  const ippFields = {
    // 20 Data Umum + technical fields IPP (pastikan tidak pernah kosong/undefined)
    jenisAlat: strVal(rawTech.jenisAlat, 'Instalasi Penyalur Petir'),
    jenisPenyalurPetir: strVal(rawTech.jenisPenyalurPetir, '-'),
    bentukPenerima: strVal(rawTech.bentukPenerima, '-'),
    merkType: strVal(rawTech.merkType, '-'),
    tahunPemasangan: strVal(rawTech.tahunPemasangan, '-'),
    tinggiTiangPenerima: strVal(rawTech.tinggiTiangPenerima, '-'),
    tinggiBangunan: strVal(rawTech.tinggiBangunan, '-'),
    jumlahAirTerminal: strVal(rawTech.jumlahAirTerminal, '-'),
    jumlahBoxKontrol: strVal(rawTech.jumlahBoxKontrol, '-'),
    jumlahElektrodaPembumian: strVal(rawTech.jumlahElektrodaPembumian, '-'),
    radiusPerlindungan: strVal(rawTech.radiusPerlindungan, '-'),
    jumlahDownConductor: strVal(rawTech.jumlahDownConductor, '-'),
    jenisDownConductor: strVal(rawTech.jenisDownConductor, '-'),
    diameterTiangPenerima: strVal(rawTech.diameterTiangPenerima, '-'),
    luasBangunan: strVal(rawTech.luasBangunan, '-'),
    jenisKonstruksi: strVal(rawTech.jenisKonstruksi, '-'),
    atapBangunan: strVal(rawTech.atapBangunan, '-'),
    dindingBangunan: strVal(rawTech.dindingBangunan, '-'),
    lantaiBangunan: strVal(rawTech.lantaiBangunan, '-'),
    lokasiPemasangan: strVal(rawTech.lokasiPemasangan, '-'),
    measuringTool: strVal(rawTech.measuringTool, 'Earth Tester Merk Kyoritsu'),
  };

  const ilFields = {
    // 12 Data Umum IL (seluruh tag dijamin terisi & tidak undefined)
    instalatirPemasang: strVal(rawTech.instalatirPemasang, '-'),
    sumberTegangan: strVal(rawTech.sumberTegangan, 'PLN'),
    sumberDayaListrik: strVal(rawTech.sumberDayaListrik, '-'),
    dayaPenerangan: strVal(rawTech.dayaPenerangan, '-'),
    dayaTenaga: strVal(rawTech.dayaTenaga, '-'),
    jumlahPhasa: strVal(rawTech.jumlahPhasa, '3 Phase'),
    frekuensi: strVal(rawTech.frekuensi, '50 Hz'),
    jenisArus: strVal(rawTech.jenisArus, 'AC (Alternating Current)'),
    teganganKerja: strVal(rawTech.teganganKerja, '220 / 380 Volt'),
    lokasiPanel: strVal(rawTech.lokasiPanel ?? rawTech.lokasiUnit, '-'),

    // Analisis Perhitungan Arus Nominal, KHA, Rating Proteksi, & Beban RST (PUIL 2011)
    dayaTerpasangKva: strVal(rawTech.dayaTerpasangKva, '0'),
    teganganVolt: strVal(rawTech.teganganVolt, '380'),
    cosPhi: strVal(rawTech.cosPhi, '0.8'),
    dayaAktifKw: strVal(rawTech.dayaAktifKw, '0'),
    dayaAktifWatt: strVal(rawTech.dayaAktifWatt, '0'),
    inDenominatorExpr: strVal(rawTech.inDenominatorExpr, '380 × 0.8 × √3'),
    inDenominatorVal: strVal(rawTech.inDenominatorVal, '0'),
    arusNominal: strVal(rawTech.arusNominal, '0'),
    khaHitung: strVal(rawTech.khaHitung, '0'),
    jenisKabel: strVal(rawTech.jenisKabel, 'NYY'),
    ukuranKabel: strVal(rawTech.ukuranKabel, '-'),
    instalasiKabel: strVal(rawTech.instalasiKabel, 'Di Udara'),
    khaKabel: strVal(rawTech.khaKabel, '0'),
    khaConclusion: strVal(rawTech.khaConclusion, '-'),
    jenisProteksi: strVal(rawTech.jenisProteksi, 'MCCB'),
    kapasitasProteksi: strVal(rawTech.kapasitasProteksi, '0'),
    ratingCbHitung: strVal(rawTech.ratingCbHitung, '0'),
    proteksiConclusion: strVal(rawTech.proteksiConclusion, '-'),
    arusR: strVal(rawTech.arusR, '0'),
    arusS: strVal(rawTech.arusS, '0'),
    arusT: strVal(rawTech.arusT, '0'),
    arusTotal: strVal(rawTech.arusTotal, '0'),
    arusRataRata: strVal(rawTech.arusRataRata, '0'),
    rasioA: strVal(rawTech.rasioA, '0.000'),
    rasioB: strVal(rawTech.rasioB, '0.000'),
    rasioC: strVal(rawTech.rasioC, '0.000'),
    devA: strVal(rawTech.devA, '0.000'),
    devB: strVal(rawTech.devB, '0.000'),
    devC: strVal(rawTech.devC, '0.000'),
    devTotal: strVal(rawTech.devTotal, '0.000'),
    unbalancePercent: strVal(rawTech.unbalancePercent, '0'),
    unbalanceConclusion: strVal(rawTech.unbalanceConclusion, '-'),
  };

  const normalizedChecklistSections = isIl
    ? (Array.isArray(reportData.checklistData?.checklistSections)
        ? reportData.checklistData.checklistSections.map((sec: any) => ({
            sectionTitle: strVal(sec?.sectionTitle, ''),
            items: Array.isArray(sec?.items)
              ? sec.items.map((it: any, idx: number) => ({
                  no: it?.no ?? idx + 1,
                  obyek: strVal(it?.obyek ?? it?.description, '-'),
                  hasil: strVal(it?.hasil ?? it?.result, '-'),
                  nilaiRujukan: strVal(it?.nilaiRujukan ?? it?.standard, '-'),
                  metode: strVal(it?.metode ?? it?.method, 'Penilaian'),
                }))
              : [],
          }))
        : [])
    : (reportData.checklistData?.checklistSections || []);

  const templateData = {
    // Spread technicalData lebih dulu agar field terformat (inspectionDate, reportDate, dll.) di bawah tidak tertimpa
    ...sanitizedTech,

    companyName: reportData.generalData?.companyName || '',
    companyAddress: reportData.generalData?.companyAddress || '',
    // Format tanggal huruf Indonesia (contoh: 12 November 2026) berlaku untuk IPP & IL
    inspectionDate: inspDateInfo.formatted || reportData.generalData?.inspectionDate || '',
    reportDate: repDateInfo.formatted || reportData.generalData?.reportDate || '',
    inspectionDay: inspDateInfo.day,
    inspectionDateFormatted: inspDateInfo.formatted,
    reportDateFormatted: repDateInfo.formatted,
    reportNumber: reportData.reportNumber || '',
    inspectorCompany: reportData.generalData?.inspectorCompany || 'PT. AKSARA RIKSA PERDANA',
    inspectorName: reportData.generalData?.inspectorName || '',
    inspectorField: reportData.generalData?.inspectorField || '',
    inspectorRegNumber: reportData.generalData?.inspectorRegNumber || reportData.generalData?.inspectorCertNumber || '',
    inspectorCertNumber: reportData.generalData?.inspectorCertNumber || reportData.generalData?.inspectorRegNumber || '',
    skpAhliImage: reportData.generalData?.skpAhliImage || '',
    skpPerusahaanImage: reportData.generalData?.skpPerusahaanImage || '',

    ...(isIl ? ilFields : ippFields),

    // Checklists
    checklistSections: normalizedChecklistSections,
    continuityItems: reportData.checklistData?.continuityItems || reportData.checklistData?.continuity || [],
    components: reportData.checklistData?.components || [],
    continuity: reportData.checklistData?.continuity || [],
    overallResult: reportData.checklistData?.overallResult || '',
    visualFaults: visualFaultsList.join('\n'),

    // Grounding & calculations
    groundingPoints: Array.isArray(rawTech.groundingPoints)
      ? rawTech.groundingPoints.map((g: any, idx: number) => ({
          no: g?.no ?? idx + 1,
          pointName: g?.pointName || `Titik ${idx + 1}`,
          resistanceValue: g?.resistanceValue ?? '-',
          pointRemarks: g?.pointRemarks ?? '-',
        }))
      : [],
    calculations: reportData.formulaResults?.calculations || [],
    overallSafetyStatus: reportData.formulaResults?.overallSafetyStatus || 'AMAN',

    // Narratives (kontrak IPP + IL + legacy)
    visualSummary: sections.visualSummary || sections.executiveSummary || '',
    testingSummary: sections.testingSummary || sections.testResultsNarrative || '',
    measurementSummary: sections.measurementSummary || sections.testResultsNarrative || '',
    executiveSummary: sections.executiveSummary || sections.visualSummary || '',
    findingsNarrative: sections.findingsNarrative || sections.visualSummary || '',
    testResultsNarrative: sections.testResultsNarrative || sections.testingSummary || sections.measurementSummary || '',
    recommendations: sections.recommendations || '',
    conclusion: sections.conclusion || '',
    closingNote: sections.closingNote || '',

    // Photos, BAP Attachments (sebelum SKP), & Extra Attachments (setelah SKP)
    photoRows,
    jointPhoto: reportData.photoDocumentation?.jointPhoto || '',
    bapAttachments: Array.isArray(reportData.bapAttachments)
      ? reportData.bapAttachments
          .filter((att: any) => typeof att?.image === 'string' && att.image.includes('base64,'))
          .map((att: any) => ({ image: att.image, bapImage: att.image }))
      : [],
    extraAttachments: Array.isArray(reportData.extraAttachments)
      ? reportData.extraAttachments
          .filter((att: any) => typeof att?.image === 'string' && att.image.includes('base64,'))
          .map((att: any) => ({ image: att.image }))
      : [],
    photos: rawPhotos.map((p: any) => ({
      image: p.dataUrl,
      caption: p.caption
    }))
  };

  doc.render(templateData);

  const outputBuffer = doc.getZip().generate({
    type: 'nodebuffer',
    compression: 'DEFLATE'
  });

  const rawFolderId = String(reportData.technicalData?.driveFolderId || '').trim();
  const clientFolderId = DRIVE_ID_RE.test(rawFolderId) ? rawFolderId : rootFolderId;
  const safeReportNum = String(reportData.reportNumber || 'REPORT').replace(/[/\s]+/g, '_');
  const reportFileName = `Laporan_${reportData.inspectionTypeCode}_${safeReportNum}.docx`;
  
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

  const fileId = uploadRes.data.id!;
  let pdfDriveFileId: string | undefined;

  // Konversi ke PDF identik melalui Google Docs API jika diminta exportFormat === 'pdf'
  if (reportData.exportFormat === 'pdf') {
    let tempDocId: string | undefined;
    try {
      const tempDoc = await drive.files.create({
        requestBody: {
          name: `_temp_${jobId}`,
          mimeType: 'application/vnd.google-apps.document',
          parents: [clientFolderId]
        },
        media: {
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          body: Readable.from(outputBuffer)
        },
        fields: 'id',
        supportsAllDrives: true,
      });
      tempDocId = tempDoc.data.id!;

      const pdfExportRes = await drive.files.export(
        { fileId: tempDocId, mimeType: 'application/pdf' },
        { responseType: 'arraybuffer' }
      );
      const pdfBuffer = Buffer.from(pdfExportRes.data as ArrayBuffer);
      const pdfFileName = reportFileName.replace(/\.docx$/i, '.pdf');

      const pdfUpload = await drive.files.create({
        requestBody: {
          name: pdfFileName,
          mimeType: 'application/pdf',
          parents: [clientFolderId]
        },
        media: {
          mimeType: 'application/pdf',
          body: Readable.from(pdfBuffer)
        },
        fields: 'id',
        supportsAllDrives: true,
      });
      pdfDriveFileId = pdfUpload.data.id!;
    } finally {
      if (tempDocId) {
        drive.files.delete({ fileId: tempDocId, supportsAllDrives: true }).catch(() => {});
      }
    }
  }

  const jobFileName = `_job_${jobId}.json`;
  const jobContent = {
    jobId,
    status: 'completed',
    progress: 100,
    outputDriveFileId: fileId,
    pdfDriveFileId,
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

  // Simpan metadata ringan laporan ke _reports_index.json di Drive agar muncul di semua device (Desktop & HP)
  const cloudId = String(reportData.cloudId || `${reportData.inspectionTypeCode || 'IPP'}_${reportData.inspectionId || jobId}`);
  const { skpAhliImage: _omitSkp1, skpPerusahaanImage: _omitSkp2, ...safeGeneralData } = reportData.generalData || {};
  const cloudSummary = {
    cloudId,
    inspectionId: reportData.inspectionId || '',
    reportNumber: reportData.reportNumber || '',
    inspectionTypeCode: reportData.inspectionTypeCode || 'IPP',
    configVersion: reportData.configVersion || '2.0.0',
    status: 'completed',
    generalData: safeGeneralData,
    technicalData: sanitizedTech,
    checklistData: reportData.checklistData || {},
    formulaResults: reportData.formulaResults || {},
    aiNarrative: reportData.aiNarrative || {},
    docxDriveFileId: fileId,
    pdfDriveFileId: pdfDriveFileId || '',
    driveFileId: pdfDriveFileId || fileId,
    createdAt: reportData.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await upsertReportToCloudIndex(drive, rootFolderId, cloudSummary);
  } catch (syncErr: any) {
    console.warn('[api/report] Gagal update _reports_index.json:', syncErr?.message);
  }

  return res.status(200).json({
    success: true,
    jobId,
    cloudId,
    outputDriveFileId: fileId,
    pdfDriveFileId,
    message: 'Pembuatan laporan selesai.'
  });
}

// 4. STATUS
async function handleStatus(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { jobId } = req.query;

  if (!jobId || typeof jobId !== 'string' || !JOB_ID_RE.test(jobId)) {
    return res.status(400).json({ error: 'Parameter query "jobId" tidak valid.' });
  }

  const drive = getDriveClient();
  const fileName = `_job_${jobId}.json`;
  const rootFolderId = process.env.ROOT_FOLDER_ID?.trim() || 'root';

  const q = `name='${fileName}' and '${rootFolderId}' in parents and trashed=false`;
  const searchRes = await drive.files.list({
    q,
    fields: 'files(id, modifiedTime)',
    orderBy: 'modifiedTime desc',
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
    const downloadFlag = String(req.query.download || '');
    const typeCodeParam = String(req.query.typeCode || '').trim().toUpperCase();

    if (downloadFlag === '1' && typeCodeParam) {
      const cleanCode = sanitizeTypeCode(typeCodeParam);
      const fileName = `Template_${cleanCode}.docx`;
      const qFile = `name='${fileName}' and '${templatesFolderId}' in parents and trashed=false`;
      const searchFileRes = await drive.files.list({
        q: qFile,
        fields: 'files(id, modifiedTime)',
        orderBy: 'modifiedTime desc',
        spaces: 'drive',
        pageSize: 1,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });
      const found = searchFileRes.data.files?.[0];
      if (!found?.id) {
        return res.status(404).json({
          error: `Template file "${fileName}" tidak ditemukan di folder 'Aksara Inspect/Templates'.`,
        });
      }

      const fileRes = await drive.files.get(
        { fileId: found.id, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer' }
      );
      const buf = Buffer.from(fileRes.data as ArrayBuffer);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
      if (found.modifiedTime) {
        res.setHeader('X-Template-Modified', found.modifiedTime);
      }
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      return res.status(200).send(buf);
    }

    const q = `'${templatesFolderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed=false`;
    const listRes = await drive.files.list({
      q,
      fields: 'files(id, name, createdTime, modifiedTime, size)',
      orderBy: 'modifiedTime desc',
      spaces: 'drive',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(200).json({
      success: true,
      templatesFolderId,
      templates: listRes.data.files || []
    });
  }

  if (req.method === 'POST') {
    const { typeCode, fileBase64 } = req.body || {};

    if (!typeCode || !fileBase64) {
      return res.status(400).json({ error: 'Payload tidak lengkap: typeCode dan fileBase64 wajib ada.' });
    }

    const cleanTypeCode = sanitizeTypeCode(typeCode);
    const targetFileName = `Template_${cleanTypeCode}.docx`;

    const fileBuffer = Buffer.from(String(fileBase64).replace(/^data:.*?;base64,/, ''), 'base64');
    if (fileBuffer.length < 4 || fileBuffer.length > 3 * 1024 * 1024) {
      return res.status(400).json({ error: 'Ukuran file template fallback tidak valid (maks 3 MB).' });
    }
    // Verifikasi magic bytes ZIP (.docx adalah arsip OOXML yang diawali PK\x03\x04)
    if (fileBuffer[0] !== 0x50 || fileBuffer[1] !== 0x4b || fileBuffer[2] !== 0x03 || fileBuffer[3] !== 0x04) {
      return res.status(400).json({ error: 'File yang diunggah bukan format dokumen .docx yang valid.' });
    }

    const q = `name='${targetFileName}' and '${templatesFolderId}' in parents and trashed=false`;
    const searchRes = await drive.files.list({
      q,
      fields: 'files(id, modifiedTime)',
      orderBy: 'modifiedTime desc',
      spaces: 'drive',
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const existingFileId = searchRes.data.files?.[0]?.id;

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

// 6. INSPECTORS (Master Ahli K3)
async function handleInspectors(req: VercelRequest, res: VercelResponse) {
  const drive = getDriveClient();
  const rootFolderId = process.env.ROOT_FOLDER_ID?.trim() || 'root';
  const fileName = '_inspectors.json';

  const q = `name='${fileName}' and '${rootFolderId}' in parents and trashed=false`;
  const searchRes = await drive.files.list({
    q,
    fields: 'files(id, modifiedTime)',
    orderBy: 'modifiedTime desc',
    spaces: 'drive',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const existingFileId = searchRes.data.files?.[0]?.id;

  if (req.method === 'GET') {
    if (!existingFileId) {
      return res.status(200).json({ success: true, inspectors: [], companySkpImage: '' });
    }
    const downloadRes = await drive.files.get(
      { fileId: existingFileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'text' }
    );
    const parsed = JSON.parse((downloadRes.data as string) || '{}');
    return res.status(200).json({
      success: true,
      inspectors: Array.isArray(parsed.inspectors) ? parsed.inspectors : [],
      companySkpImage: typeof parsed.companySkpImage === 'string' ? parsed.companySkpImage : '',
    });
  }

  if (req.method === 'POST') {
    const { inspectors, companySkpImage } = req.body || {};
    if (inspectors !== undefined && !Array.isArray(inspectors)) {
      return res.status(400).json({ error: 'Payload tidak valid: inspectors harus berupa array.' });
    }
    if (inspectors === undefined && companySkpImage === undefined) {
      return res.status(400).json({ error: 'Payload kosong: kirim inspectors atau companySkpImage.' });
    }

    let currentData: { inspectors: any[]; companySkpImage?: string } = {
      inspectors: [],
      companySkpImage: '',
    };
    if (existingFileId) {
      try {
        const currentRes = await drive.files.get(
          { fileId: existingFileId, alt: 'media', supportsAllDrives: true },
          { responseType: 'text' }
        );
        const parsed = JSON.parse((currentRes.data as string) || '{}');
        currentData = {
          inspectors: Array.isArray(parsed.inspectors) ? parsed.inspectors : [],
          companySkpImage: typeof parsed.companySkpImage === 'string' ? parsed.companySkpImage : '',
        };
      } catch {
        // abaikan jika file belum valid
      }
    }

    const payload = JSON.stringify(
      {
        inspectors: inspectors !== undefined ? inspectors : currentData.inspectors,
        companySkpImage: companySkpImage !== undefined ? companySkpImage : currentData.companySkpImage,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    );
    const media = {
      mimeType: 'application/json',
      body: Readable.from(payload),
    };

    if (existingFileId) {
      await drive.files.update({
        fileId: existingFileId,
        requestBody: { name: fileName },
        media,
        supportsAllDrives: true,
      });
    } else {
      await drive.files.create({
        requestBody: {
          name: fileName,
          mimeType: 'application/json',
          parents: [rootFolderId],
        },
        media,
        fields: 'id',
        supportsAllDrives: true,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Data Master Ahli K3 berhasil disinkronkan.',
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// 7. VISION & PRE-FLIGHT QC (Gemini 2.5 Flash + Fallback Stabil)
async function handleVision(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'GEMINI_API_KEY belum dikonfigurasi di server.' });
  }

  const { mode, inspectionType, imageDataUrl, photos, context, payload } = req.body || {};
  const genAI = new GoogleGenerativeAI(apiKey);
  const flashCandidates = ['gemini-2.5-flash', 'gemini-2.5-pro'];

  if (mode === 'ocr_meter') {
    if (!imageDataUrl) return res.status(400).json({ error: 'imageDataUrl wajib diisi.' });
    const mimeMatch = String(imageDataUrl).match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
    if (!mimeMatch) {
      return res.status(400).json({ error: 'Format gambar OCR tidak didukung (gunakan JPEG, PNG, atau WebP).' });
    }
    const mimeType = mimeMatch[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : mimeMatch[1].toLowerCase();
    const base64 = mimeMatch[2];

    const isIlVision = String(inspectionType || '').toUpperCase() === 'IL';

    const result = await generateContentWithRetry(genAI, flashCandidates, {
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { data: base64, mimeType } },
            {
              text: isIlVision
                ? 'Baca layar alat ukur kelistrikan (Clamp Meter, Multimeter, Thermograph, atau Earth Tester) pada foto ini. Ekstrak nilai angka yang terbaca (arus R/S/T dalam Ampere, tegangan dalam Volt, suhu °C, atau tahanan pentanahan dalam Ohm) tanpa satuan, lalu kembalikan JSON. Kosongkan field yang tidak tampak.'
                : 'Baca layar alat ukur Earth Tester pada foto ini. Ekstrak angka tahanan pembumian dalam Ohm (hanya angka desimal, misal "1.39") dan merk/tipe alat ukur jika terlihat. Kembalikan JSON.'
            }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: isIlVision
          ? {
              type: SchemaType.OBJECT,
              properties: {
                arusR: { type: SchemaType.STRING, description: 'Angka arus Phasa R (A) bila terlihat' },
                arusS: { type: SchemaType.STRING, description: 'Angka arus Phasa S (A) bila terlihat' },
                arusT: { type: SchemaType.STRING, description: 'Angka arus Phasa T (A) bila terlihat' },
                teganganVolt: { type: SchemaType.STRING, description: 'Angka tegangan Volt bila terlihat' },
                suhuR: { type: SchemaType.STRING, description: 'Angka suhu °C bila terlihat (thermograph)' },
                tahananPentanahan: { type: SchemaType.STRING, description: 'Angka tahanan pembumian Ohm bila terlihat' },
                toolBrand: { type: SchemaType.STRING, description: 'Merk/tipe alat ukur jika terlihat' }
              }
            }
          : {
              type: SchemaType.OBJECT,
              properties: {
                resistanceValue: { type: SchemaType.STRING, description: 'Angka tahanan Ohm saja, misal 1.39' },
                toolBrand: { type: SchemaType.STRING, description: 'Merk/tipe alat ukur jika terlihat' }
              }
            },
        temperature: 0.1
      }
    });

    return res.status(200).json({
      success: true,
      data: parseGeminiJson(result.response.text())
    });
  }

  if (mode === 'categorize_photos') {
    if (!Array.isArray(photos) || photos.length === 0) {
      return res.status(400).json({ error: 'photos wajib diisi.' });
    }
    const parts: any[] = [];
    photos.slice(0, 12).forEach((p: any, idx: number) => {
      const m = String(p.dataUrl || '').match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/i);
      if (m) {
        const mimeType = m[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : m[1].toLowerCase();
        parts.push({ text: `Foto ID: ${p.id} (Urutan ${idx + 1})` });
        parts.push({ inlineData: { data: m[2], mimeType } });
      }
    });

    const isIlPhotos = String(context?.inspectionType || inspectionType || '').toUpperCase() === 'IL';
    parts.push({
      text: isIlPhotos
        ? `Identifikasi setiap foto pemeriksaan Instalasi Listrik ini (misal: Panel LVMDP/SDP ${context?.lokasiPanel || ''}, Tampak Dalam Panel & Busbar, Pengaman MCCB/ACB, Pengukuran Arus R/S/T ${context?.arusR || ''}/${context?.arusS || ''}/${context?.arusT || ''} A dengan Clamp Meter, Pengukuran Suhu Thermograph, Pengukuran Grounding ${context?.tahananPentanahan || ''} Ohm, atau Foto Bersama Pihak Perusahaan). Berikan caption Bahasa Indonesia formal yang singkat & konsisten untuk setiap ID, dan tandai isJointPhoto=true maksimal pada 1 foto bersama tim/perusahaan jika ada.`
        : `Identifikasi setiap foto inspeksi penyalur petir ini (misal: Air Terminal / Splitzen, Box Kontrol / Test Joint, Pengukuran Grounding ${context?.tahananPembumian || ''} Ohm dengan ${context?.measuringTool || 'Earth Tester'}, atau Foto Bersama Pihak Perusahaan). Berikan caption Bahasa Indonesia formal yang singkat & konsisten untuk setiap ID, dan tandai isJointPhoto=true maksimal pada 1 foto bersama tim/perusahaan jika ada.`
    });

    const result = await generateContentWithRetry(genAI, flashCandidates, {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            items: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  id: { type: SchemaType.STRING },
                  caption: { type: SchemaType.STRING },
                  isJointPhoto: { type: SchemaType.BOOLEAN }
                },
                required: ['id', 'caption', 'isJointPhoto']
              }
            }
          },
          required: ['items']
        },
        temperature: 0.2
      }
    });

    return res.status(200).json({
      success: true,
      data: parseGeminiJson(result.response.text())
    });
  }

  if (mode === 'preflight_qc') {
    const isIlQc = String(payload?.inspectionType || inspectionType || '').toUpperCase() === 'IL';
    const result = await generateContentWithRetry(genAI, flashCandidates, {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: isIlQc
                ? `Periksa konsistensi angka perhitungan PUIL 2011 (In, KHA >= 125% In, Rating CB >= 115% In, I unbalance < 20%, Pentanahan <= 5 Ohm) terhadap narasi Pemeriksaan, Pengujian, Kesimpulan, dan Syarat-Syarat pada payload laporan IL berikut. Jawab singkat dalam 2-4 poin Bahasa Indonesia:\n${JSON.stringify(payload)}`
                : `Periksa konsistensi angka & status hukum K3 pada payload laporan IPP berikut (apakah angka tahanan pembumian di tabel sama dengan di narasi, apakah status memenuhi <= 5 Ohm konsisten dengan kesimpulan). Jawab singkat dalam 2-4 poin Bahasa Indonesia:\n${JSON.stringify(payload)}`
            }
          ]
        }
      ],
      generationConfig: { temperature: 0.1 }
    });
    return res.status(200).json({
      success: true,
      data: { summary: result.response.text() }
    });
  }

  return res.status(400).json({ error: `Mode vision "${mode}" tidak dikenal.` });
}

// 5B. TEMPLATE RESUMABLE UPLOAD SESSION (Direct Browser -> Drive tanpa lewat Vercel payload)
async function handleTemplateUploadSession(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { typeCode } = req.body || {};
  if (!typeCode) {
    return res.status(400).json({ error: 'Parameter typeCode wajib disertakan.' });
  }

  const drive = getDriveClient();
  const rootFolderId = process.env.ROOT_FOLDER_ID?.trim() || 'root';
  const templatesFolderId = await getTemplatesFolderId(drive, rootFolderId);

  const cleanTypeCode = sanitizeTypeCode(typeCode);
  const targetFileName = `Template_${cleanTypeCode}.docx`;
  const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  const q = `name='${targetFileName}' and '${templatesFolderId}' in parents and trashed=false`;
  const searchRes = await drive.files.list({
    q,
    fields: 'files(id, modifiedTime)',
    orderBy: 'modifiedTime desc',
    spaces: 'drive',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const existingFileId = searchRes.data.files?.[0]?.id;
  const accessToken = await getDriveAccessToken();
  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;

  const initUrl = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=resumable&supportsAllDrives=true`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true`;

  const metadata = existingFileId
    ? { name: targetFileName, mimeType: docxMime }
    : { name: targetFileName, mimeType: docxMime, parents: [templatesFolderId] };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': docxMime,
  };
  if (originHeader) {
    headers.Origin = originHeader;
  }

  const initRes = await fetch(initUrl, {
    method: existingFileId ? 'PATCH' : 'POST',
    headers,
    body: JSON.stringify(metadata),
  });

  if (!initRes.ok) {
    const errText = await initRes.text().catch(() => '');
    console.error('[api/report] Template upload session init failed:', initRes.status, errText);
    throw new Error(`Gagal menginisiasi sesi upload Drive (HTTP ${initRes.status}).`);
  }

  const uploadUrl = initRes.headers.get('location');
  if (!uploadUrl) {
    throw new Error('Google Drive tidak mengembalikan upload session URI.');
  }

  return res.status(200).json({
    success: true,
    uploadUrl,
    existingFileId: existingFileId || null,
    targetFileName,
  });
}

// 8. CLOUD REPORTS INDEX (_reports_index.json untuk sinkronisasi Desktop <-> Mobile)
const REPORTS_INDEX_FILENAME = '_reports_index.json';

async function readReportsIndex(drive: any, rootFolderId: string): Promise<{ fileId: string | null; reports: any[]; deletedCloudIds: string[]; deletedFileIds: string[] }> {
  let q = `name='${REPORTS_INDEX_FILENAME}' and '${rootFolderId}' in parents and trashed=false`;
  let searchRes = await drive.files.list({
    q,
    fields: 'files(id)',
    spaces: 'drive',
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  let fileId = searchRes.data.files?.[0]?.id || null;

  if (!fileId) {
    // Fallback pencarian global jika ROOT_FOLDER_ID berbeda
    q = `name='${REPORTS_INDEX_FILENAME}' and trashed=false`;
    searchRes = await drive.files.list({
      q,
      fields: 'files(id)',
      spaces: 'drive',
      pageSize: 1,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    fileId = searchRes.data.files?.[0]?.id || null;
  }

  if (!fileId) return { fileId: null, reports: [], deletedCloudIds: [], deletedFileIds: [] };

  try {
    const dl = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'text' }
    );
    const parsed = JSON.parse((dl.data as string) || '{}');
    return {
      fileId,
      reports: Array.isArray(parsed.reports) ? parsed.reports : [],
      deletedCloudIds: Array.isArray(parsed.deletedCloudIds) ? parsed.deletedCloudIds : [],
      deletedFileIds: Array.isArray(parsed.deletedFileIds) ? parsed.deletedFileIds : [],
    };
  } catch {
    return { fileId, reports: [], deletedCloudIds: [], deletedFileIds: [] };
  }
}

async function writeReportsIndex(
  drive: any,
  rootFolderId: string,
  existingFileId: string | null,
  reports: any[],
  deletedCloudIds: string[] = [],
  deletedFileIds: string[] = []
) {
  const payload = JSON.stringify(
    { reports, deletedCloudIds, deletedFileIds, updatedAt: new Date().toISOString() },
    null,
    2
  );
  const media = { mimeType: 'application/json', body: Readable.from(payload) };
  if (existingFileId) {
    await drive.files.update({
      fileId: existingFileId,
      requestBody: { name: REPORTS_INDEX_FILENAME },
      media,
      supportsAllDrives: true,
    });
  } else {
    await drive.files.create({
      requestBody: { name: REPORTS_INDEX_FILENAME, mimeType: 'application/json', parents: [rootFolderId] },
      media,
      fields: 'id',
      supportsAllDrives: true,
    });
  }
}

async function upsertReportToCloudIndex(drive: any, rootFolderId: string, summary: any) {
  const { fileId, reports, deletedCloudIds, deletedFileIds } = await readReportsIndex(drive, rootFolderId);
  const idx = reports.findIndex((r: any) => r.cloudId === summary.cloudId);
  const next = [...reports];
  if (idx >= 0) {
    next[idx] = {
      ...next[idx],
      ...summary,
      docxDriveFileId: summary.docxDriveFileId || next[idx].docxDriveFileId || '',
      pdfDriveFileId: summary.pdfDriveFileId || next[idx].pdfDriveFileId || '',
    };
  } else {
    next.unshift(summary);
  }
  const filteredDeleted = deletedCloudIds.filter((id) => id !== summary.cloudId);
  const restoredFileIds = new Set([summary.docxDriveFileId, summary.pdfDriveFileId, summary.driveFileId].filter(Boolean));
  const filteredDeletedFiles = deletedFileIds.filter((fid) => !restoredFileIds.has(fid));
  await writeReportsIndex(drive, rootFolderId, fileId, next, filteredDeleted, filteredDeletedFiles);
}

async function discoverExistingDriveReports(
  drive: any,
  existingReports: any[],
  deletedCloudIds: string[],
  deletedFileIds: string[] = []
): Promise<{ discovered: any[]; changed: boolean }> {
  const knownFileIds = new Set<string>();
  for (const r of existingReports) {
    if (r.docxDriveFileId) knownFileIds.add(r.docxDriveFileId);
    if (r.pdfDriveFileId) knownFileIds.add(r.pdfDriveFileId);
    if (r.driveFileId) knownFileIds.add(r.driveFileId);
  }
  const deletedFileSet = new Set(deletedFileIds);

  const res = await drive.files.list({
    q: `(name contains 'Laporan_IPP_' or name contains 'Laporan_IL_') and trashed=false`,
    fields: 'files(id, name, mimeType, createdTime, modifiedTime, parents)',
    spaces: 'drive',
    pageSize: 100,
    orderBy: 'modifiedTime desc',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  const files = res.data.files || [];
  if (files.length === 0) return { discovered: [], changed: false };

  const grouped = new Map<string, {
    baseName: string;
    parentId: string;
    typeCode: string;
    docxId: string;
    pdfId: string;
    createdAt: string;
    updatedAt: string;
  }>();

  for (const f of files) {
    const fname = String(f.name || '');
    if (!/\.(docx|pdf)$/i.test(fname)) continue;
    if (knownFileIds.has(f.id) || deletedFileSet.has(f.id)) continue;

    const baseName = fname.replace(/\.(docx|pdf)$/i, '');
    const parentId = f.parents?.[0] || 'root';
    const key = `${parentId}__${baseName}`;
    const typeMatch = baseName.match(/^Laporan_(IPP|IL)_/i);
    const typeCode = typeMatch ? typeMatch[1].toUpperCase() : 'IPP';

    const existing = grouped.get(key) || {
      baseName,
      parentId,
      typeCode,
      docxId: '',
      pdfId: '',
      createdAt: f.createdTime || new Date().toISOString(),
      updatedAt: f.modifiedTime || f.createdTime || new Date().toISOString(),
    };

    if (/\.docx$/i.test(fname) && !existing.docxId) existing.docxId = f.id;
    if (/\.pdf$/i.test(fname) && !existing.pdfId) existing.pdfId = f.id;
    grouped.set(key, existing);
  }

  if (grouped.size === 0) return { discovered: [], changed: false };

  const parentMetaCache = new Map<string, any>();
  const discovered: any[] = [];
  const deletedSet = new Set(deletedCloudIds);

  for (const [, grp] of grouped) {
    const cloudId = `drive_${grp.parentId}_${grp.baseName}`;
    if (deletedSet.has(cloudId)) continue;

    // Cari apakah ada entry existing di folder & reportNumber yang sama untuk merge file ID-nya
    const rawNumPart = grp.baseName.replace(/^Laporan_(IPP|IL)_/i, '');
    const parsedReportNum = rawNumPart.replace(/_/g, '/');

    let inspMeta = parentMetaCache.get(grp.parentId);
    if (inspMeta === undefined && grp.parentId !== 'root') {
      try {
        const metaSearch = await drive.files.list({
          q: `name='data-inspeksi.json' and '${grp.parentId}' in parents and trashed=false`,
          fields: 'files(id)',
          pageSize: 1,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });
        const metaId = metaSearch.data.files?.[0]?.id;
        if (metaId) {
          const metaDl = await drive.files.get(
            { fileId: metaId, alt: 'media', supportsAllDrives: true },
            { responseType: 'json' }
          );
          inspMeta = typeof metaDl.data === 'string' ? JSON.parse(metaDl.data) : metaDl.data;
        } else {
          inspMeta = null;
        }
      } catch {
        inspMeta = null;
      }
      parentMetaCache.set(grp.parentId, inspMeta);
    }

    const reportDateJakarta = new Date(grp.updatedAt).toLocaleDateString('en-CA', {
      timeZone: 'Asia/Jakarta',
    });

    discovered.push({
      cloudId,
      inspectionId: inspMeta?.id || '',
      reportNumber: parsedReportNum,
      inspectionTypeCode: grp.typeCode,
      configVersion: '2.0.0',
      status: 'completed',
      generalData: {
        companyName: inspMeta?.clientName || 'Laporan di Google Drive',
        companyAddress: inspMeta?.unitData?.lokasiUnit || '',
        inspectionDate: inspMeta?.tanggal_inspeksi || inspMeta?.unitData?.tanggal_inspeksi || '',
        reportDate: reportDateJakarta,
      },
      technicalData: {
        ...(inspMeta?.unitData || {}),
        driveFolderId: grp.parentId,
      },
      docxDriveFileId: grp.docxId,
      pdfDriveFileId: grp.pdfId,
      driveFileId: grp.pdfId || grp.docxId,
      createdAt: grp.createdAt,
      updatedAt: grp.updatedAt,
    });
  }

  return { discovered, changed: discovered.length > 0 };
}

async function handleReports(req: VercelRequest, res: VercelResponse) {
  const drive = getDriveClient();
  const rootFolderId = process.env.ROOT_FOLDER_ID?.trim() || 'root';

  if (req.method === 'GET') {
    const { fileId, reports, deletedCloudIds, deletedFileIds } = await readReportsIndex(drive, rootFolderId);
    try {
      const { discovered, changed } = await discoverExistingDriveReports(
        drive,
        reports,
        deletedCloudIds,
        deletedFileIds
      );
      if (changed) {
        const merged = [...discovered, ...reports];
        await writeReportsIndex(drive, rootFolderId, fileId, merged, deletedCloudIds, deletedFileIds).catch(() => {});
        return res.status(200).json({ success: true, reports: merged, deletedCloudIds });
      }
    } catch (discErr: any) {
      console.warn('[api/report] Gagal auto-discover laporan Drive:', discErr?.message);
    }
    return res.status(200).json({ success: true, reports, deletedCloudIds });
  }

  if (req.method === 'POST') {
    const { report } = req.body || {};
    if (!report || !report.cloudId) {
      return res.status(400).json({ error: 'Payload tidak valid: report.cloudId wajib ada.' });
    }
    await upsertReportToCloudIndex(drive, rootFolderId, report);
    return res.status(200).json({ success: true });
  }

  if (req.method === 'DELETE') {
    const cloudId = String(req.query.cloudId || req.body?.cloudId || '').trim();
    if (!cloudId) {
      return res.status(400).json({ error: 'Parameter cloudId wajib disertakan.' });
    }
    const { fileId, reports, deletedCloudIds, deletedFileIds } = await readReportsIndex(drive, rootFolderId);
    const removed = reports.filter((r: any) => r.cloudId === cloudId);
    const filtered = reports.filter((r: any) => r.cloudId !== cloudId);
    const newlyDeletedFiles = removed
      .flatMap((r: any) => [r.docxDriveFileId, r.pdfDriveFileId, r.driveFileId])
      .filter(Boolean);
    const nextDeleted = Array.from(new Set([...deletedCloudIds, cloudId]));
    const nextDeletedFiles = Array.from(new Set([...deletedFileIds, ...newlyDeletedFiles]));
    await writeReportsIndex(drive, rootFolderId, fileId, filtered, nextDeleted, nextDeletedFiles);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// --- MAIN ROUTER ---
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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
    } else if (action === 'template-upload-session') {
      return await handleTemplateUploadSession(req, res);
    } else if (action === 'inspectors') {
      return await handleInspectors(req, res);
    } else if (action === 'vision') {
      return await handleVision(req, res);
    } else if (action === 'reports') {
      return await handleReports(req, res);
    } else {
      return res.status(400).json({ error: `Action "${action}" tidak valid.` });
    }
  } catch (error: any) {
    console.error(`[api/report] Error in action ${action}:`, error);
    const msg = String(error?.message || '');
    const isClientValidation =
      msg.includes('tidak valid') || msg.includes('wajib') || msg.includes('tidak ditemukan');
    return res
      .status(isClientValidation ? 400 : 500)
      .json({ error: isClientValidation ? msg : 'Terjadi kesalahan saat memproses laporan.' });
  }
}
