// src/utils/wordExport.ts
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell,
  TextRun, ImageRun, Header, Footer, PageNumber,
  AlignmentType, BorderStyle, WidthType, HeadingLevel,
  PageBreak, ShadingType, convertInchesToTwip,
} from 'docx';
import { saveAs } from 'file-saver';

// ==========================================
// LABEL MAP
// ==========================================
const FIELD_LABELS: Record<string, string> = {
  namaUnit: 'Nama Unit / Deskripsi',
  nomorSeri: 'Nomor Seri',
  nomorUnit: 'Nomor Unit / Kode Alat',
  merekModel: 'Merek / Model',
  pabrikPembuat: 'Pabrik Pembuat',
  tahunPembuatan: 'Tahun Pembuatan',
  lokasiUnit: 'Lokasi / Penempatan Unit',
  catatan: 'Catatan Tambahan',
  jenisAngkur: 'Jenis Angkur',
  kapasitasTarik: 'Kapasitas Tarik / MBS (kN)',
  kapasitasGeser: 'Kapasitas Geser (kN)',
  diameterAngkur: 'Diameter Angkur (mm)',
  kedalamanPasang: 'Kedalaman Pasang (mm)',
  materialAngkur: 'Material Angkur',
  jumlahAngkur: 'Jumlah Angkur Diperiksa (pcs)',
  lokasiKodeTitik: 'Lokasi / Kode Titik',
  jenisPAA: 'Jenis Pesawat Angkat & Angkut',
  kapasitasAngkat: 'Kapasitas Angkat Maksimum (Ton)',
  jangkauanBoom: 'Jangkauan / Span Boom (m)',
  tinggiAngkatMaks: 'Tinggi Angkat Maksimum (m)',
  jenisPenggerak: 'Jenis Penggerak',
  nomorPlatRegistrasi: 'Nomor Plat / Registrasi',
  nomorIzinOperasi: 'Nomor Izin Operasi',
  jenisPUBT: 'Jenis Pesawat Uap / Bejana Tekan',
  volume: 'Volume (Liter)',
  tekananKerjaMaks: 'Tekanan Kerja Maksimum (Bar)',
  temperaturKerja: 'Temperatur Kerja (°C)',
  mediaIsi: 'Media Isi',
  kapasitasProduksi: 'Kapasitas Produksi (kg/jam)',
  nomorNDT: 'Nomor NDT Terakhir',
  tanggalNDT: 'Tanggal NDT Terakhir',
  jenisPTP: 'Jenis Pesawat Tenaga & Produksi',
  daya: 'Daya (kW)',
  dayaHP: 'Daya (HP)',
  putaranRPM: 'Putaran (RPM)',
  mediaKerja: 'Media Kerja',
  tekananKerjaPTP: 'Tekanan Kerja (Bar)',
  tegangan: 'Tegangan Listrik (Volt)',
  arusListrik: 'Arus Listrik (Ampere)',
  jenisListrik: 'Jenis Instalasi',
  dayaTerpasang: 'Daya Terpasang (kVA)',
  teganganSistem: 'Tegangan Sistem',
  luasArea: 'Luas Area Instalasi (m²)',
  jumlahPanel: 'Jumlah Panel (unit)',
  tahananIsolasi: 'Tahanan Isolasi (MΩ)',
  nilaiGrounding: 'Nilai Grounding (Ω)',
  nomorSertifikatSLO: 'Nomor Sertifikat SLO',
  jenisPenyalurPetir: 'Jenis Sistem Penangkal',
  luasAreaPetir: 'Luas Area yang Dilindungi (m²)',
  tinggiTiangPenangkal: 'Tinggi Tiang Penangkal (m)',
  tahananPembumian: 'Nilai Tahanan Pembumian (Ω)',
  jumlahTitikGrounding: 'Jumlah Titik Grounding',
  jenisElektroda: 'Jenis Elektroda Pembumian',
  kedalamanElektroda: 'Kedalaman Elektroda (m)',
  jenisLift: 'Jenis Elevator / Eskalator',
  kapasitasKg: 'Kapasitas (kg)',
  kapasitasOrang: 'Kapasitas (orang)',
  kecepatanLift: 'Kecepatan (m/s)',
  jumlahLantai: 'Jumlah Lantai / Stop',
  jenisPenggerakLift: 'Jenis Penggerak',
  nomorIzinLift: 'Nomor Izin Operasi',
  tanggalIzinBerlaku: 'Berlaku Hingga',
  jenisProteksi: 'Jenis Sistem Proteksi',
  jumlahUnitAPAR: 'Jumlah Unit APAR',
  kapasitasMedia: 'Kapasitas Media Pemadam (kg)',
  luasAreaProteksi: 'Luas Area Proteksi (m²)',
  jumlahHeadSprinkler: 'Jumlah Head Sprinkler (pcs)',
  tekananSistem: 'Tekanan Sistem (Bar)',
  mediaPemadam: 'Jenis Media Pemadam',
  jumlahHydrant: 'Jumlah Hydrant (unit)',
};

const COMMON_FIELD_KEYS = [
  'namaUnit', 'nomorSeri', 'nomorUnit', 'merekModel',
  'pabrikPembuat', 'tahunPembuatan', 'lokasiUnit',
];
const NOTES_KEY = 'catatan';

// ==========================================
// COLORS (hex string untuk docx)
// ==========================================
const C = {
  emerald: '10B981',
  emeraldLight: 'D1FAE5',
  slate: '1E293B',
  gray: '6B7280',
  white: 'FFFFFF',
  black: '111827',
  headerBg: '1E293B',
  rowAlt: 'F8FAFC',
};

// ==========================================
// HELPERS
// ==========================================
async function resolvePhotoDataUrl(
  photo: { dataUrl?: string; driveFileId?: string }
): Promise<string> {
  if (photo.dataUrl?.startsWith('data:image')) return photo.dataUrl;
  if (photo.driveFileId) {
    try {
      const res = await fetch(`/api/photo-proxy?fileId=${photo.driveFileId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch {
      return '';
    }
  }
  return '';
}

function dataUrlToBuffer(dataUrl: string): { buffer: ArrayBuffer; type: 'jpg' | 'png' } {
  const [header, base64] = dataUrl.split(',');
  const type = header.includes('png') ? 'png' : 'jpg';
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
  return { buffer, type };
}

async function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 4, height: 3 });
    img.src = dataUrl;
  });
}

function makeTableCell(
  text: string,
  opts: {
    bold?: boolean;
    bg?: string;
    color?: string;
    width?: number; // percentage
    fontSize?: number;
  } = {}
): TableCell {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.bg ? { type: ShadingType.SOLID, color: opts.bg, fill: opts.bg } : undefined,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
      left: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
      right: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
    },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: opts.bold ?? false,
            color: opts.color ?? C.black,
            size: (opts.fontSize ?? 9) * 2,
            font: 'Calibri',
          }),
        ],
        spacing: { before: 60, after: 60 },
      }),
    ],
  });
}

function sectionHeading(title: string): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({
        text: title,
        bold: true,
        color: C.slate,
        size: 20,
        font: 'Calibri',
      }),
    ],
    heading: HeadingLevel.HEADING_2,
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 6, color: C.emerald },
    },
    spacing: { before: 240, after: 120 },
  });
}

// ==========================================
// MAIN EXPORT
// ==========================================
export async function exportToWord(item: any, fileName: string): Promise<void> {
  const nowStr = new Date().toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  const inspDate = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString('id-ID', {
        day: '2-digit', month: 'long', year: 'numeric',
      })
    : '-';

  const unitData: Record<string, string> = item.unitData || {};
  const objType: string = item.objectType || '-';
  const photos: any[] = item.photos || [];

  // ── Common fields ──
  const commonRows = COMMON_FIELD_KEYS
    .filter(k => unitData[k] !== undefined && unitData[k] !== '')
    .map(k => [FIELD_LABELS[k] || k, String(unitData[k])]);

  // ── Specific fields ──
  const specificKeys = Object.keys(unitData).filter(
    k => !COMMON_FIELD_KEYS.includes(k) && k !== NOTES_KEY && unitData[k] !== ''
  );
  const specificRows = specificKeys.map(k => [FIELD_LABELS[k] || k, String(unitData[k])]);

  // ── Resolve semua foto ──
  const resolvedUrls = await Promise.all(photos.map(p => resolvePhotoDataUrl(p)));
  const dimensions = await Promise.all(resolvedUrls.map(url => getImageDimensions(url)));

  // ==========================================
  // SECTIONS
  // ==========================================
  const children: (Paragraph | Table)[] = [];

  // ── Cover / Header info ──
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'LAPORAN INSPEKSI K3', bold: true, size: 36, color: C.slate, font: 'Calibri' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'PT AKSARA RIKSA PERDANA', bold: true, size: 22, color: C.emerald, font: 'Calibri' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Perusahaan Jasa K3 (PJK3) — Terakreditasi Kemnaker RI', size: 18, color: C.gray, font: 'Calibri' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Jl. Cibodas Raya No. 02, Antapani Kidul, Kec. Antapani, Kota Bandung, Jawa Barat 40291', size: 16, color: C.gray, font: 'Calibri' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: '+62 821-2984-9515  |  aksara.riksa.perdana@gmail.com  |  aksarariksapjk3.com', size: 16, color: C.gray, font: 'Calibri' }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
  );

  // ── Info table (klien, tanggal, status) ──
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            makeTableCell('PERUSAHAAN KLIEN', { bold: true, bg: C.emerald, color: C.white, width: 35, fontSize: 8 }),
            makeTableCell(item.clientName || '-', { bold: true, width: 65, fontSize: 11 }),
          ],
        }),
        new TableRow({
          children: [
            makeTableCell('Jenis Inspeksi', { bold: true, bg: C.rowAlt, width: 35 }),
            makeTableCell(objType, { width: 65 }),
          ],
        }),
        new TableRow({
          children: [
            makeTableCell('Tanggal Inspeksi', { bold: true, bg: C.rowAlt, width: 35 }),
            makeTableCell(inspDate, { width: 65 }),
          ],
        }),
        new TableRow({
          children: [
            makeTableCell('Status', { bold: true, bg: C.rowAlt, width: 35 }),
            makeTableCell('Selesai & Tersinkronisasi ✓', { bold: true, color: '059669', width: 65 }),
          ],
        }),
        new TableRow({
          children: [
            makeTableCell('Dicetak', { bold: true, bg: C.rowAlt, width: 35 }),
            makeTableCell(nowStr, { width: 65 }),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 200 } }),
  );

  // ── Identitas Unit ──
  if (commonRows.length > 0) {
    children.push(sectionHeading('IDENTITAS UNIT'));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              makeTableCell('Field', { bold: true, bg: C.emerald, color: C.white, width: 45 }),
              makeTableCell('Nilai', { bold: true, bg: C.emerald, color: C.white, width: 55 }),
            ],
          }),
          ...commonRows.map((row, i) =>
            new TableRow({
              children: [
                makeTableCell(row[0], { bold: true, bg: i % 2 === 1 ? C.rowAlt : C.white, color: C.slate, width: 45 }),
                makeTableCell(row[1], { bg: i % 2 === 1 ? C.rowAlt : C.white, width: 55 }),
              ],
            })
          ),
        ],
      }),
      new Paragraph({ spacing: { after: 160 } }),
    );
  }

  // ── Data Teknis ──
  if (specificRows.length > 0) {
    children.push(sectionHeading(`DATA TEKNIS — ${objType.toUpperCase()}`));
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              makeTableCell('Parameter', { bold: true, bg: C.slate, color: C.white, width: 50 }),
              makeTableCell('Nilai', { bold: true, bg: C.slate, color: C.white, width: 50 }),
            ],
          }),
          ...specificRows.map((row, i) =>
            new TableRow({
              children: [
                makeTableCell(row[0], { bold: true, bg: i % 2 === 1 ? C.rowAlt : C.white, color: C.slate, width: 50 }),
                makeTableCell(row[1], { bg: i % 2 === 1 ? C.rowAlt : C.white, width: 50 }),
              ],
            })
          ),
        ],
      }),
      new Paragraph({ spacing: { after: 160 } }),
    );
  }

  // ── Catatan Tambahan ──
  const catatan = unitData[NOTES_KEY];
  if (catatan?.trim()) {
    children.push(
      sectionHeading('CATATAN TAMBAHAN'),
      new Paragraph({
        children: [new TextRun({ text: catatan, size: 18, font: 'Calibri', color: C.black })],
        shading: { type: ShadingType.SOLID, color: 'FFFBEB', fill: 'FFFBEB' },
        border: {
          left: { style: BorderStyle.THICK, size: 12, color: 'F59E0B' },
        },
        spacing: { before: 80, after: 200 },
        indent: { left: convertInchesToTwip(0.2) },
      }),
    );
  }

  // ── Foto — page break dulu, lalu grid 2 kolom ──
  if (photos.length > 0) {
    // Page break sebelum foto
    children.push(
      new Paragraph({
        children: [new PageBreak()],
      }),
      sectionHeading(`FOTO DOKUMENTASI (${photos.length} foto)`),
    );

    // Foto dalam table 2 kolom
    // Max lebar foto: ~8cm per kolom (dalam EMU: 1cm = 914400/100*100 = 914400 EMU? no: 1 inch = 914400 EMU, 1cm = 360000 EMU)
    const MAX_W_EMU = 3200000; // ~8.9cm
    const MAX_H_EMU = 2800000; // ~7.8cm

    for (let i = 0; i < resolvedUrls.length; i += 2) {
      const urlL = resolvedUrls[i];
      const urlR = i + 1 < resolvedUrls.length ? resolvedUrls[i + 1] : null;

      const makePhotoCell = (url: string | null, idx: number): TableCell => {
        if (!url || !url.startsWith('data:image')) {
          return makeTableCell('Foto tidak tersedia', { color: C.gray, width: 50 });
        }
        const { buffer, type } = dataUrlToBuffer(url);
        const dim = dimensions[idx];
        const aspect = dim.height / dim.width;

        let w = MAX_W_EMU;
        let h = Math.round(w * aspect);
        if (h > MAX_H_EMU) {
          h = MAX_H_EMU;
          w = Math.round(h / aspect);
        }

        return new TableCell({
          width: { size: 50, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
            left: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
            right: { style: BorderStyle.SINGLE, size: 1, color: 'E2E8F0' },
          },
          children: [
            new Paragraph({
              children: [
                new ImageRun({
                  data: buffer,
                  transformation: { width: Math.round(w / 9144), height: Math.round(h / 9144) },
                  type,
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 80, after: 40 },
            }),
            new Paragraph({
              children: [
                new TextRun({ text: `Foto ${idx + 1}`, size: 14, color: C.gray, font: 'Calibri' }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 80 },
            }),
          ],
        });
      };

      const row = new TableRow({
        children: [
          makePhotoCell(urlL, i),
          makePhotoCell(urlR, i + 1),
        ],
      });

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [row],
        }),
        new Paragraph({ spacing: { after: 120 } }),
      );
    }
  }

  // ==========================================
  // DOCUMENT
  // ==========================================
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 18 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'PT AKSARA RIKSA PERDANA', bold: true, size: 16, color: C.emerald, font: 'Calibri' }),
                  new TextRun({ text: '  —  Laporan Inspeksi K3', size: 16, color: C.gray, font: 'Calibri' }),
                ],
                border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: C.emerald } },
                spacing: { after: 60 },
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: 'PT Aksara Riksa Perdana — Digenerate otomatis oleh Aksara Inspect  |  Hal. ', size: 14, color: C.gray, font: 'Calibri' }),
                  new TextRun({ text: 'Hal. ', size: 14, color: C.gray, font: 'Calibri' }),
                ],
                alignment: AlignmentType.CENTER,
                border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' } },
                spacing: { before: 60 },
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${fileName}.docx`);
}