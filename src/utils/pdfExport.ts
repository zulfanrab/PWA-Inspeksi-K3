// src/utils/pdfExport.ts
// FIXED: Label field manusiawi (bukan camelCase), header perusahaan proper,
//        foto adaptive layout COMPACT — semua foto masuk grid rapi, tidak makan space berlebihan

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ==========================================
// LABEL MAP — camelCase → Label Indonesia
// ==========================================

const FIELD_LABELS: Record<string, string> = {
  // Common Fields
  namaUnit: 'Nama Unit / Deskripsi',
  nomorSeri: 'Nomor Seri',
  nomorUnit: 'Nomor Unit / Kode Alat',
  merekModel: 'Merek / Model',
  pabrikPembuat: 'Pabrik Pembuat',
  tahunPembuatan: 'Tahun Pembuatan',
  lokasiUnit: 'Lokasi / Penempatan Unit',
  catatan: 'Catatan Tambahan',
  // Angkur
  jenisAngkur: 'Jenis Angkur',
  kapasitasTarik: 'Kapasitas Tarik / MBS (kN)',
  kapasitasGeser: 'Kapasitas Geser (kN)',
  diameterAngkur: 'Diameter Angkur (mm)',
  kedalamanPasang: 'Kedalaman Pasang (mm)',
  materialAngkur: 'Material Angkur',
  jumlahAngkur: 'Jumlah Angkur Diperiksa (pcs)',
  lokasiKodeTitik: 'Lokasi / Kode Titik',
  // PAA
  jenisPAA: 'Jenis Pesawat Angkat & Angkut',
  kapasitasAngkat: 'Kapasitas Angkat Maksimum (Ton)',
  jangkauanBoom: 'Jangkauan / Span Boom (m)',
  tinggiAngkatMaks: 'Tinggi Angkat Maksimum (m)',
  jenisPenggerak: 'Jenis Penggerak',
  nomorPlatRegistrasi: 'Nomor Plat / Registrasi',
  nomorIzinOperasi: 'Nomor Izin Operasi',
  // PUBT
  jenisPUBT: 'Jenis Pesawat Uap / Bejana Tekan',
  volume: 'Volume (Liter)',
  tekananKerjaMaks: 'Tekanan Kerja Maksimum (Bar)',
  temperaturKerja: 'Temperatur Kerja (°C)',
  mediaIsi: 'Media Isi',
  kapasitasProduksi: 'Kapasitas Produksi (kg/jam)',
  nomorNDT: 'Nomor NDT Terakhir',
  tanggalNDT: 'Tanggal NDT Terakhir',
  // PTP
  jenisPTP: 'Jenis Pesawat Tenaga & Produksi',
  daya: 'Daya (kW)',
  dayaHP: 'Daya (HP)',
  putaranRPM: 'Putaran (RPM)',
  mediaKerja: 'Media Kerja',
  tekananKerjaPTP: 'Tekanan Kerja (Bar)',
  tegangan: 'Tegangan Listrik (Volt)',
  arusListrik: 'Arus Listrik (Ampere)',
  // Listrik
  jenisListrik: 'Jenis Instalasi',
  dayaTerpasang: 'Daya Terpasang (kVA)',
  teganganSistem: 'Tegangan Sistem',
  luasArea: 'Luas Area Instalasi (m²)',
  jumlahPanel: 'Jumlah Panel (unit)',
  tahananIsolasi: 'Tahanan Isolasi (MΩ)',
  nilaiGrounding: 'Nilai Grounding (Ω)',
  nomorSertifikatSLO: 'Nomor Sertifikat SLO',
  // Penyalur Petir
  jenisPenyalurPetir: 'Jenis Sistem Penangkal',
  luasAreaPetir: 'Luas Area yang Dilindungi (m²)',
  tinggiTiangPenangkal: 'Tinggi Tiang Penangkal (m)',
  tahananPembumian: 'Nilai Tahanan Pembumian (Ω)',
  jumlahTitikGrounding: 'Jumlah Titik Grounding',
  jenisElektroda: 'Jenis Elektroda Pembumian',
  kedalamanElektroda: 'Kedalaman Elektroda (m)',
  // Lift
  jenisLift: 'Jenis Elevator / Eskalator',
  kapasitasKg: 'Kapasitas (kg)',
  kapasitasOrang: 'Kapasitas (orang)',
  kecepatanLift: 'Kecepatan (m/s)',
  jumlahLantai: 'Jumlah Lantai / Stop',
  jenisPenggerakLift: 'Jenis Penggerak',
  nomorIzinLift: 'Nomor Izin Operasi',
  tanggalIzinBerlaku: 'Berlaku Hingga',
  // Proteksi Kebakaran
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
// COLORS
// ==========================================
const COLOR = {
  emerald: [16, 185, 129] as [number, number, number],
  emeraldLight: [209, 250, 229] as [number, number, number],
  slate: [71, 85, 105] as [number, number, number],
  gray: [107, 114, 128] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  black: [17, 24, 39] as [number, number, number],
  headerBg: [30, 41, 59] as [number, number, number],
};

// ==========================================
// HELPERS
// ==========================================

function camelToLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

function sectionHeader(
  doc: jsPDF,
  title: string,
  y: number,
  pageW: number,
  margin: number
): number {
  doc.setFillColor(...COLOR.emerald);
  doc.rect(margin, y, 3, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...COLOR.slate);
  doc.text(title, margin + 6, y + 5.5);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(
    margin + 6 + doc.getTextWidth(title) + 3,
    y + 3,
    pageW - margin,
    y + 3
  );
  return y + 11;
}

function checkPageBreak(
  doc: jsPDF,
  y: number,
  needed: number,
  pageH: number,
  margin: number
): number {
  if (y + needed > pageH - 15) {
    doc.addPage();
    return margin;
  }
  return y;
}

// Helper: ambil dataUrl foto — dari lokal jika ada, dari Drive jika tidak
async function resolvePhotoDataUrl(
  photo: { dataUrl?: string; driveFileId?: string }
): Promise<string> {
  if (photo.dataUrl && photo.dataUrl.startsWith('data:image')) {
    return photo.dataUrl;
  }
  if (photo.driveFileId) {
    try {
      const url = `/api/photo-proxy?fileId=${photo.driveFileId}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.warn('[pdfExport] Gagal fetch foto dari Drive:', err);
      return '';
    }
  }
  return '';
}

async function getImageDimensions(
  dataUrl: string
): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (!dataUrl || !dataUrl.startsWith('data:image')) {
      resolve({ width: 4, height: 3 });
      return;
    }
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 4, height: 3 });
    img.src = dataUrl;
  });
}

// ==========================================
// FOTO LAYOUT — COMPACT GRID
// ==========================================
// Aturan layout baru:
//   - Semua foto masuk grid 2 kolom (kiri & kanan), tidak peduli portrait/landscape
//   - Tinggi baris ditentukan oleh foto tertinggi di baris itu (aspect ratio tetap terjaga)
//   - Max tinggi per foto dibatasi 65mm — foto tidak akan makan setengah halaman
//   - Foto portrait di kolom kiri/kanan tetap tidak gepeng, di-center secara vertikal
//   - Gap antar foto: 4mm horizontal, 6mm vertikal
//   - Caption nomor foto di bawah masing-masing foto

const PHOTO_COL_GAP = 4;   // mm gap antara kolom kiri dan kanan
const PHOTO_ROW_GAP = 6;   // mm gap antar baris
const PHOTO_MAX_H  = 65;   // mm tinggi maksimum per foto (cegah foto makan setengah halaman)
const CAPTION_H    = 6;    // mm ruang caption di bawah foto

async function renderPhotoGrid(
  doc: jsPDF,
  photos: any[],
  resolvedDataUrls: string[],
  dimensions: { width: number; height: number }[],
  startY: number,
  pageH: number,
  margin: number,
  contentW: number
): Promise<number> {
  let y = startY;
  const colW = (contentW - PHOTO_COL_GAP) / 2;

  for (let i = 0; i < photos.length; i += 2) {
    // Hitung dimensi foto kiri
    const dimL = dimensions[i];
    const aspectL = dimL.height / dimL.width;
    const hL = Math.min(colW * aspectL, PHOTO_MAX_H);
    const wL = hL / aspectL; // lebar aktual setelah dibatasi tinggi

    // Hitung dimensi foto kanan (kalau ada)
    let hR = 0;
    let wR = 0;
    if (i + 1 < photos.length) {
      const dimR = dimensions[i + 1];
      const aspectR = dimR.height / dimR.width;
      hR = Math.min(colW * aspectR, PHOTO_MAX_H);
      wR = hR / aspectR;
    }

    // Tinggi baris = foto tertinggi di baris ini
    const rowH = Math.max(hL, hR);

    // Cek page break — butuh rowH + caption + gap
    y = checkPageBreak(doc, y, rowH + CAPTION_H + PHOTO_ROW_GAP, pageH, margin);

    // ── Render foto KIRI ──
    const dataUrlL = resolvedDataUrls[i] || '';
    // Center horizontal dalam kolom (kalau foto lebih kecil dari colW)
    const xOffsetL = margin + (colW - wL) / 2;
    // Center vertikal dalam baris
    const yOffsetL = y + (rowH - hL) / 2;

    if (dataUrlL.startsWith('data:image')) {
      try {
        doc.addImage(dataUrlL, 'JPEG', xOffsetL, yOffsetL, wL, hL, undefined, 'MEDIUM');
      } catch {
        _drawPhotoPlaceholder(doc, margin, y, colW, rowH, COLOR);
      }
    } else {
      _drawPhotoPlaceholder(doc, margin, y, colW, rowH, COLOR);
    }

    // Border tipis di sekitar area kolom kiri
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, colW, rowH, 'S');

    // Caption kiri
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...COLOR.gray);
    doc.text(`Foto ${i + 1}`, margin + colW / 2, y + rowH + 4, { align: 'center' });

    // ── Render foto KANAN (kalau ada) ──
    if (i + 1 < photos.length) {
      const dataUrlR = resolvedDataUrls[i + 1] || '';
      const xR = margin + colW + PHOTO_COL_GAP;
      const xOffsetR = xR + (colW - wR) / 2;
      const yOffsetR = y + (rowH - hR) / 2;

      if (dataUrlR.startsWith('data:image')) {
        try {
          doc.addImage(dataUrlR, 'JPEG', xOffsetR, yOffsetR, wR, hR, undefined, 'MEDIUM');
        } catch {
          _drawPhotoPlaceholder(doc, xR, y, colW, rowH, COLOR);
        }
      } else {
        _drawPhotoPlaceholder(doc, xR, y, colW, rowH, COLOR);
      }

      // Border tipis kolom kanan
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.rect(xR, y, colW, rowH, 'S');

      // Caption kanan
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(...COLOR.gray);
      doc.text(`Foto ${i + 2}`, xR + colW / 2, y + rowH + 4, { align: 'center' });
    }

    y += rowH + CAPTION_H + PHOTO_ROW_GAP;
  }

  return y;
}

// Helper: gambar kotak abu placeholder kalau foto gagal load
function _drawPhotoPlaceholder(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  color: typeof COLOR
) {
  doc.setFillColor(243, 244, 246);
  doc.rect(x, y, w, h, 'F');
  doc.setFontSize(7);
  doc.setTextColor(...color.gray);
  doc.text('Foto tidak tersedia', x + w / 2, y + h / 2, { align: 'center' });
}

// ==========================================
// MAIN EXPORT
// ==========================================

export const exportToPDF = async (
  item: any,
  fileName: string
): Promise<void> => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;

  let y = margin;

  // ---- HEADER PERUSAHAAN ----
  doc.setFillColor(...COLOR.headerBg);
  doc.rect(0, 0, pageW, 38, 'F');

  // Logo
  try {
    const logoRes = await fetch('/icons/icon-192.png');
    const blob = await logoRes.blob();
    const logoDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    doc.addImage(logoDataUrl, 'PNG', margin, 7, 14, 14);
  } catch {
    doc.setFillColor(...COLOR.emerald);
    doc.roundedRect(margin, 7, 14, 14, 2, 2, 'F');
    doc.setTextColor(...COLOR.white);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('A', margin + 5, 16);
  }

  const textX = margin + 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR.white);
  doc.text('PT AKSARA RIKSA PERDANA', textX, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(163, 230, 188);
  doc.text('Perusahaan Jasa K3 (PJK3) — Terakreditasi Kemnaker RI', textX, 18);

  doc.setFontSize(6);
  doc.setTextColor(203, 213, 225);
  doc.text('Jl. Cibodas Raya No. 02, Antapani Kidul,', textX, 23);
  doc.text('Kec. Antapani, Kota Bandung, Jawa Barat 40291', textX, 27);
  doc.text('+62 821-2984-9515  |  aksara.riksa.perdana@gmail.com  |  aksarariksapjk3.com', textX, 31);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLOR.emerald);
  doc.text('LAPORAN INSPEKSI K3', pageW - margin, 13, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(163, 230, 188);
  const nowStr = new Date().toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  doc.text(`Dicetak: ${nowStr}`, pageW - margin, 18, { align: 'right' });

  doc.setDrawColor(...COLOR.emerald);
  doc.setLineWidth(0.4);
  doc.line(0, 38, pageW, 38);

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 38, pageW, 10, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...COLOR.white);
  const objType = item.objectType || '-';
  doc.text(`Jenis Inspeksi: ${objType}`, margin, 45);
  doc.text('Status: Selesai & Tersinkronisasi ✓', pageW - margin, 45, { align: 'right' });

  y = 56;

  // ---- INFO KLIEN ----
  doc.setFillColor(...COLOR.emeraldLight);
  doc.roundedRect(margin, y, contentW, 16, 2, 2, 'F');
  doc.setDrawColor(...COLOR.emerald);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentW, 16, 2, 2, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...COLOR.slate);
  doc.text('PERUSAHAAN KLIEN', margin + 4, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLOR.black);
  doc.text(item.clientName || '-', margin + 4, y + 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...COLOR.gray);
  const inspDate = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString('id-ID', {
        day: '2-digit', month: 'long', year: 'numeric',
      })
    : '-';
  doc.text(`Tanggal Inspeksi: ${inspDate}`, pageW - margin - 4, y + 5, { align: 'right' });
  if (item.updatedAt && item.updatedAt !== item.createdAt) {
    const updDate = new Date(item.updatedAt).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
    doc.text(`Diperbarui: ${updDate}`, pageW - margin - 4, y + 12, { align: 'right' });
  }

  y += 22;

  // ---- SEKSI: IDENTITAS UNIT ----
  y = sectionHeader(doc, 'IDENTITAS UNIT', y, pageW, margin);

  const commonRows = COMMON_FIELD_KEYS.filter(
    (k) => item.unitData?.[k] !== undefined && item.unitData?.[k] !== ''
  ).map((k) => [FIELD_LABELS[k] || k, String(item.unitData[k])]);

  if (commonRows.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Field', 'Nilai']],
      body: commonRows,
      theme: 'grid',
      headStyles: { fillColor: COLOR.emerald, textColor: COLOR.white, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: contentW * 0.45, fontStyle: 'bold', textColor: COLOR.slate },
        1: { cellWidth: contentW * 0.55, textColor: COLOR.black },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ---- SEKSI: DATA TEKNIS SPESIFIK ----
  const specificKeys = Object.keys(item.unitData || {}).filter(
    (k) => !COMMON_FIELD_KEYS.includes(k) && k !== NOTES_KEY && item.unitData[k] !== ''
  );

  if (specificKeys.length > 0) {
    y = checkPageBreak(doc, y, 20, pageH, margin);
    y = sectionHeader(doc, `DATA TEKNIS — ${objType.toUpperCase()}`, y, pageW, margin);

    const specificRows = specificKeys.map((k) => [
      FIELD_LABELS[k] || camelToLabel(k),
      String(item.unitData[k]),
    ]);

    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Parameter', 'Nilai']],
      body: specificRows,
      theme: 'grid',
      headStyles: { fillColor: COLOR.slate, textColor: COLOR.white, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: contentW * 0.5, fontStyle: 'bold', textColor: COLOR.slate },
        1: { cellWidth: contentW * 0.5, textColor: COLOR.black },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ---- CATATAN TAMBAHAN ----
  const catatan = item.unitData?.[NOTES_KEY];
  if (catatan && String(catatan).trim()) {
    y = checkPageBreak(doc, y, 24, pageH, margin);
    y = sectionHeader(doc, 'CATATAN TAMBAHAN', y, pageW, margin);

    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(251, 191, 36);
    doc.setLineWidth(0.3);
    const catatanLines = doc.splitTextToSize(String(catatan), contentW - 10);
    const catatanH = Math.max(12, catatanLines.length * 4.5 + 6);
    doc.roundedRect(margin, y, contentW, catatanH, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 80, 20);
    doc.text(catatanLines, margin + 4, y + 6);
    y += catatanH + 6;
  }

  // ---- SEKSI: FOTO DOKUMENTASI ----
  // Layout baru: grid 2 kolom seragam, max tinggi 65mm per foto
  const photos: any[] = item.photos || [];
  if (photos.length > 0) {
    y = checkPageBreak(doc, y, 30, pageH, margin);
    y = sectionHeader(
      doc,
      `FOTO DOKUMENTASI (${photos.length} foto)`,
      y,
      pageW,
      margin
    );

    // Resolve semua foto dulu (lokal atau dari Drive)
    const resolvedDataUrls = await Promise.all(
      photos.map((p) => resolvePhotoDataUrl(p))
    );
    // Ambil dimensi semua foto
    const dimensions = await Promise.all(
      resolvedDataUrls.map((url) => getImageDimensions(url))
    );

    // Render dengan grid 2 kolom compact
    y = await renderPhotoGrid(
      doc, photos, resolvedDataUrls, dimensions,
      y, pageH, margin, contentW
    );
  }

  // ---- FOOTER di setiap halaman ----
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(248, 250, 252);
    doc.rect(0, pageH - 10, pageW, 10, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, pageH - 10, pageW - margin, pageH - 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...COLOR.gray);
    doc.text(
      'PT Aksara Riksa Perdana — Dokumen ini digenerate otomatis oleh Aksara Inspect',
      margin,
      pageH - 4
    );
    doc.text(`Halaman ${p} / ${totalPages}`, pageW - margin, pageH - 4, { align: 'right' });
  }

  doc.save(`${fileName}.pdf`);
};