// src/utils/reportTemplatePayload.ts
import type PizZip from 'pizzip';
import { computeIlAnalysis } from '../report-configs/instalasi-listrik/formulas';

export interface PreviewPhotoItem {
  id: string;
  caption: string;
  dataUrl?: string;
  driveFileId?: string;
}

export interface PreviewAttachmentItem {
  sourceFileName: string;
  pageNumber: number;
  dataUrl: string;
}

export interface ReportPreviewData {
  inspectionTypeCode: string;
  reportNumber: string;
  generalData: {
    companyName: string;
    companyAddress: string;
    inspectionDate: string;
    reportDate: string;
    inspectorCompany: string;
    inspectorName: string;
    inspectorField: string;
    inspectorCertNumber: string;
    skpAhliImage?: string;
    skpPerusahaanImage?: string;
  };
  technicalData: Record<string, any>;
  checklistSections: any[];
  continuityItems?: any[];
  calculations?: any;
  narratives: {
    visualSummary?: string;
    measurementSummary?: string;
    testingSummary?: string;
    executiveSummary?: string;
    findingsNarrative?: string;
    testResultsNarrative?: string;
    conclusion?: string;
    recommendations?: string;
    closingNote?: string;
  };
  gridPhotos: PreviewPhotoItem[];
  jointPhoto?: PreviewPhotoItem | null;
  bapAttachments: PreviewAttachmentItem[];
  extraAttachments: PreviewAttachmentItem[];
}

export function formatIndonesianDayAndDate(dateStr?: string): { day: string; formatted: string } {
  if (!dateStr) return { day: '', formatted: '' };
  const raw = String(dateStr).trim();
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  let parsed: Date | null = null;
  const dmyMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  const ymdMatch = raw.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  const idTextMatch = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);

  if (dmyMatch) {
    const [, dd, mm, yyyy] = dmyMatch;
    parsed = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00+07:00`);
  } else if (ymdMatch) {
    const [, yyyy, mm, dd] = ymdMatch;
    parsed = new Date(`${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00+07:00`);
  } else if (idTextMatch) {
    const [, dd, mName, yyyy] = idTextMatch;
    const mIdx = months.findIndex((m) => m.toLowerCase() === mName.toLowerCase());
    if (mIdx >= 0) {
      parsed = new Date(`${yyyy}-${String(mIdx + 1).padStart(2, '0')}-${dd.padStart(2, '0')}T00:00:00+07:00`);
    }
  } else {
    parsed = new Date(raw.includes('T') ? raw : `${raw}T00:00:00+07:00`);
  }

  if (!parsed || isNaN(parsed.getTime())) return { day: '', formatted: raw };

  return {
    day: days[parsed.getDay()] || '',
    formatted: `${parsed.getDate()} ${months[parsed.getMonth()]} ${parsed.getFullYear()}`,
  };
}

export function injectBapLoopIntoDocumentXml(zip: PizZip, hasBapUploads: boolean): void {
  if (!hasBapUploads) return;
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) return;

  const xml = docXmlFile.asText();
  const plainText = xml.replace(/<[^>]+>/g, '');
  if (plainText.includes('bapAttachments')) return;

  const targetAnchor = plainText.includes('skpPerusahaanImage')
    ? 'skpPerusahaanImage'
    : plainText.includes('skpAhliImage')
    ? 'skpAhliImage'
    : null;
  if (!targetAnchor) return;

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

function strVal(v: any, fallback: string): string {
  return v !== undefined && v !== null && String(v).trim() !== '' ? String(v) : fallback;
}

export function buildTemplateRenderData(
  preview: ReportPreviewData,
  options: { includeMedia: boolean; resolvedMediaMap?: Record<string, string> }
): Record<string, any> {
  const { includeMedia, resolvedMediaMap = {} } = options;
  const typeCodeUpper = String(preview.inspectionTypeCode || 'IPP').toUpperCase();
  const isIl = typeCodeUpper === 'IL';

  const rawTech = preview.technicalData || {};
  const sanitizedTech = Object.fromEntries(
    Object.entries(rawTech).filter(([, v]) => v !== undefined && v !== null)
  );

  const inspDateInfo = formatIndonesianDayAndDate(preview.generalData.inspectionDate);
  const repDateInfo = formatIndonesianDayAndDate(preview.generalData.reportDate);

  const pickPhotoDataUrl = (p?: PreviewPhotoItem | null): string => {
    if (!includeMedia || !p) return '';
    if (p.dataUrl && p.dataUrl.includes('base64,')) return p.dataUrl;
    if (p.id && resolvedMediaMap[p.id]?.includes('base64,')) return resolvedMediaMap[p.id];
    return '';
  };

  const photoRows: Array<Record<string, string>> = [];
  for (let i = 0; i < preview.gridPhotos.length; i += 3) {
    const p1 = preview.gridPhotos[i];
    const p2 = preview.gridPhotos[i + 1];
    const p3 = preview.gridPhotos[i + 2];
    photoRows.push({
      img1: pickPhotoDataUrl(p1),
      caption1: p1?.caption || '',
      img2: pickPhotoDataUrl(p2),
      caption2: p2?.caption || '',
      img3: pickPhotoDataUrl(p3),
      caption3: p3?.caption || '',
    });
  }

  const ippFields = {
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

  const ilCalc = isIl ? computeIlAnalysis(rawTech) : null;
  const ilFields = ilCalc
    ? {
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
        dayaTerpasangKva: ilCalc.dayaTerpasangKva,
        teganganVolt: ilCalc.teganganVolt,
        cosPhi: ilCalc.cosPhi,
        dayaAktifKw: ilCalc.dayaAktifKw,
        dayaAktifWatt: ilCalc.dayaAktifWatt,
        inDenominatorExpr: ilCalc.inDenominatorExpr,
        inDenominatorVal: ilCalc.inDenominatorVal,
        arusNominal: ilCalc.arusNominal,
        khaHitung: ilCalc.khaHitung,
        jenisKabel: ilCalc.jenisKabel,
        ukuranKabel: ilCalc.ukuranKabel,
        instalasiKabel: ilCalc.instalasiKabel,
        khaKabel: ilCalc.khaKabel,
        khaConclusion: ilCalc.khaConclusion,
        jenisProteksi: ilCalc.jenisProteksi,
        kapasitasProteksi: ilCalc.kapasitasProteksi,
        ratingCbHitung: ilCalc.ratingCbHitung,
        proteksiConclusion: ilCalc.proteksiConclusion,
        arusR: ilCalc.arusR,
        arusS: ilCalc.arusS,
        arusT: ilCalc.arusT,
        arusTotal: ilCalc.arusTotal,
        arusRataRata: ilCalc.arusRataRata,
        rasioA: ilCalc.rasioA,
        rasioB: ilCalc.rasioB,
        rasioC: ilCalc.rasioC,
        devA: ilCalc.devA,
        devB: ilCalc.devB,
        devC: ilCalc.devC,
        devTotal: ilCalc.devTotal,
        unbalancePercent: ilCalc.unbalancePercent,
        unbalanceConclusion: ilCalc.unbalanceConclusion,
      }
    : {};

  const normalizedChecklistSections = isIl
    ? preview.checklistSections.map((sec: any) => ({
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
    : preview.checklistSections;

  const skpAhliImg = includeMedia ? preview.generalData.skpAhliImage || '' : '';
  const skpPerusahaanImg = includeMedia ? preview.generalData.skpPerusahaanImage || '' : '';
  const jointImg = pickPhotoDataUrl(preview.jointPhoto);

  const bapItems = includeMedia
    ? preview.bapAttachments
        .filter((att) => att.dataUrl && att.dataUrl.includes('base64,'))
        .map((att) => ({ image: att.dataUrl, bapImage: att.dataUrl }))
    : [];

  const extraItems = includeMedia
    ? preview.extraAttachments
        .filter((att) => att.dataUrl && att.dataUrl.includes('base64,'))
        .map((att) => ({ image: att.dataUrl }))
    : [];

  const sec = preview.narratives || {};

  return {
    ...sanitizedTech,

    companyName: preview.generalData.companyName || '',
    companyAddress: preview.generalData.companyAddress || '',
    inspectionDate: inspDateInfo.formatted || preview.generalData.inspectionDate || '',
    reportDate: repDateInfo.formatted || preview.generalData.reportDate || '',
    inspectionDay: inspDateInfo.day,
    inspectionDateFormatted: inspDateInfo.formatted,
    reportDateFormatted: repDateInfo.formatted,
    reportNumber: preview.reportNumber || '',
    inspectorCompany: preview.generalData.inspectorCompany || 'PT. AKSARA RIKSA PERDANA',
    inspectorName: preview.generalData.inspectorName || '',
    inspectorField: preview.generalData.inspectorField || '',
    inspectorRegNumber: preview.generalData.inspectorCertNumber || '',
    inspectorCertNumber: preview.generalData.inspectorCertNumber || '',
    skpAhliImage: skpAhliImg,
    skpPerusahaanImage: skpPerusahaanImg,

    ...(isIl ? ilFields : ippFields),

    checklistSections: normalizedChecklistSections,
    continuityItems: preview.continuityItems || [],
    continuity: preview.continuityItems || [],

    groundingPoints: Array.isArray(rawTech.groundingPoints)
      ? rawTech.groundingPoints.map((g: any, idx: number) => ({
          no: g?.no ?? idx + 1,
          pointName: g?.pointName || `Titik ${idx + 1}`,
          resistanceValue: g?.resistanceValue ?? '-',
          pointRemarks: g?.pointRemarks ?? '-',
        }))
      : [],
    calculations: preview.calculations?.calculations || [],
    overallSafetyStatus: preview.calculations?.overallSafetyStatus || 'AMAN',

    visualSummary: sec.visualSummary || sec.executiveSummary || '',
    testingSummary: sec.testingSummary || sec.testResultsNarrative || '',
    measurementSummary: sec.measurementSummary || sec.testResultsNarrative || '',
    executiveSummary: sec.executiveSummary || sec.visualSummary || '',
    findingsNarrative: sec.findingsNarrative || sec.visualSummary || '',
    testResultsNarrative: sec.testResultsNarrative || sec.testingSummary || sec.measurementSummary || '',
    recommendations: sec.recommendations || '',
    conclusion: sec.conclusion || '',
    closingNote: sec.closingNote || '',

    photoRows,
    jointPhoto: jointImg,
    bapAttachments: bapItems,
    extraAttachments: extraItems,
    photos: includeMedia
      ? preview.gridPhotos.map((p) => ({ image: pickPhotoDataUrl(p), caption: p.caption }))
      : [],
  };
}
