// src/utils/pdfExport.ts
// FIXED: Label field manusiawi (bukan camelCase), header perusahaan proper,
//        foto grid, grouping per seksi, dan formatting Indonesia

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// ==========================================
// LABEL MAP — camelCase → Label Indonesia
// ==========================================

// FIXED: Semua field key dari COMMON_FIELDS + SPECIFIC_FIELDS dipetakan ke label manusiawi
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

// Field umum yang tampil di seksi "Identitas Unit"
const COMMON_FIELD_KEYS = [
  'namaUnit', 'nomorSeri', 'nomorUnit', 'merekModel',
  'pabrikPembuat', 'tahunPembuatan', 'lokasiUnit',
];

const NOTES_KEY = 'catatan';

// ==========================================
// COLORS
// ==========================================
const COLOR = {
  emerald: [16, 185, 129] as [number, number, number],   // emerald-500
  emeraldLight: [209, 250, 229] as [number, number, number], // emerald-100
  slate: [71, 85, 105] as [number, number, number],
  gray: [107, 114, 128] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  black: [17, 24, 39] as [number, number, number],
  headerBg: [30, 41, 59] as [number, number, number],    // slate-800
};

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
  // FIXED: Header proper dengan nama perusahaan, judul laporan, dan info dokumen
  doc.setFillColor(...COLOR.headerBg);
  doc.rect(0, 0, pageW, 38, 'F');

  // Logo placeholder (kotak emerald)
  doc.setFillColor(...COLOR.emerald);
  doc.roundedRect(margin, 8, 10, 10, 2, 2, 'F');
  doc.setTextColor(...COLOR.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('A', margin + 3.5, 15);

  // Nama perusahaan
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLOR.white);
  doc.text('PT AKSARA RIKSA PERDANA', margin + 14, 13);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(163, 230, 188);
  doc.text('Perusahaan Jasa Keselamatan dan Kesehatan Kerja (PJK3) | aksarariksa.co.id', margin + 14, 18);

  // Judul laporan (kanan atas)
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLOR.emerald);
  doc.text('LAPORAN INSPEKSI K3', pageW - margin, 13, { align: 'right' });

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(163, 230, 188);
  const nowStr = new Date().toLocaleDateString('id-ID', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
  doc.text(`Dicetak: ${nowStr}`, pageW - margin, 18, { align: 'right' });

  // Divider
  doc.setDrawColor(...COLOR.emerald);
  doc.setLineWidth(0.5);
  doc.line(margin, 26, pageW - margin, 26);

  // Subtitle baris bawah header
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLOR.white);
  const objType = item.objectType || '-';
  doc.text(`Jenis Inspeksi: ${objType}`, margin, 33);
  doc.text(`Status: Selesai & Tersinkronisasi`, pageW - margin, 33, { align: 'right' });

  y = 46;

  // ---- INFO KLIEN ----
  // FIXED: Card info klien yang rapih
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

  // Tanggal inspeksi di kanan
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...COLOR.gray);
  const inspDate = item.createdAt
    ? new Date(item.createdAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
    : '-';
  doc.text(`Tanggal Inspeksi: ${inspDate}`, pageW - margin - 4, y + 5, { align: 'right' });
  if (item.updatedAt && item.updatedAt !== item.createdAt) {
    const updDate = new Date(item.updatedAt).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.text(`Diperbarui: ${updDate}`, pageW - margin - 4, y + 12, { align: 'right' });
  }

  y += 22;

  // ---- SEKSI: IDENTITAS UNIT ----
  y = sectionHeader(doc, 'IDENTITAS UNIT', y, pageW, margin);

  const commonRows = COMMON_FIELD_KEYS
    .filter((k) => item.unitData?.[k] !== undefined && item.unitData?.[k] !== '')
    .map((k) => [FIELD_LABELS[k] || k, String(item.unitData[k])]);

  if (commonRows.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [['Field', 'Nilai']],
      body: commonRows,
      theme: 'grid',
      headStyles: {
        fillColor: COLOR.emerald,
        textColor: COLOR.white,
        fontStyle: 'bold',
        fontSize: 8,
      },
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
    y = checkPageBreak(doc, y, 20, pageH, margin, pageW);
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
      headStyles: {
        fillColor: COLOR.slate,
        textColor: COLOR.white,
        fontStyle: 'bold',
        fontSize: 8,
      },
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
    y = checkPageBreak(doc, y, 24, pageH, margin, pageW);
    y = sectionHeader(doc, 'CATATAN TAMBAHAN', y, pageW, margin);

    doc.setFillColor(255, 251, 235); // amber-50
    doc.setDrawColor(251, 191, 36);  // amber-400
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
  // FIXED: Render foto sebagai grid 2 kolom di PDF
  const photos: any[] = item.photos || [];
  if (photos.length > 0) {
    y = checkPageBreak(doc, y, 30, pageH, margin, pageW);
    y = sectionHeader(doc, `FOTO DOKUMENTASI (${photos.length} foto)`, y, pageW, margin);

    const photoW = (contentW - 6) / 2;
    const photoH = photoW * 0.65;
    const cols = 2;

    for (let i = 0; i < photos.length; i++) {
      const col = i % cols;
      const x = margin + col * (photoW + 6);

      if (col === 0 && i > 0) y += photoH + 8;
      y = checkPageBreak(doc, y, photoH + 10, pageH, margin, pageW);

      try {
        const dataUrl: string = photos[i].dataUrl || '';
        if (dataUrl.startsWith('data:image')) {
          doc.addImage(dataUrl, 'JPEG', x, y, photoW, photoH, undefined, 'MEDIUM');
        }
      } catch {
        // Gambar gagal render — tampilkan placeholder
        doc.setFillColor(243, 244, 246);
        doc.rect(x, y, photoW, photoH, 'F');
        doc.setFontSize(7);
        doc.setTextColor(...COLOR.gray);
        doc.text('Foto tidak tersedia', x + photoW / 2, y + photoH / 2, { align: 'center' });
      }

      // Caption
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...COLOR.gray);
      doc.text(`Foto ${i + 1}`, x, y + photoH + 3);
    }

    // Advance y setelah baris foto terakhir
    const lastRow = Math.floor((photos.length - 1) / cols);
    const firstRowY = y - lastRow * (photoH + 8);
    y = firstRowY + (Math.ceil(photos.length / cols)) * (photoH + 8) + 2;
  }

  // ---- FOOTER di setiap halaman ----
  // FIXED: Footer dengan nomor halaman dan info perusahaan
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
    doc.text('PT Aksara Riksa Perdana — Dokumen ini digenerate otomatis oleh Aksara Inspect', margin, pageH - 4);
    doc.text(`Halaman ${p} / ${totalPages}`, pageW - margin, pageH - 4, { align: 'right' });
  }

  doc.save(`${fileName}.pdf`);
};

// ==========================================
// HELPERS
// ==========================================

// FIXED: Fallback converter camelCase → label baca manusia kalau key tidak ada di map
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
  doc.line(margin + 6 + doc.getTextWidth(title) + 3, y + 3, pageW - margin, y + 3);
  return y + 11;
}

function checkPageBreak(
  doc: jsPDF,
  y: number,
  needed: number,
  pageH: number,
  margin: number,
  pageW: number
): number {
  if (y + needed > pageH - 15) {
    doc.addPage();
    return margin;
  }
  return y;
}