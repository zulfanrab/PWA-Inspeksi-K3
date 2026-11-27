// src/components/report/preview/IppPaperMirror.tsx
import React from 'react';
import type { ReportPreviewData } from '../../../utils/reportTemplatePayload';
import {
  FolioPaperSheet,
  PaperHeaderBand,
  PaperSignatureBlock,
  PaperAppendices,
  TOSKA_MATI,
  TOSKA_SUBTLE,
} from './PaperMirrorShared';

interface IppPaperMirrorProps {
  renderedData: Record<string, any>;
  previewData: ReportPreviewData;
  showMedia: boolean;
  apiBase: string;
}

export function IppPaperMirror({
  renderedData,
  previewData,
  showMedia,
  apiBase,
}: IppPaperMirrorProps) {
  const dataUmumRows: Array<[number, string, string]> = [
    [1, 'Jenis Alat', renderedData.jenisAlat],
    [2, 'Jenis Penyalur Petir', renderedData.jenisPenyalurPetir],
    [3, 'Bentuk Penerima', renderedData.bentukPenerima],
    [4, 'Merk / Type', renderedData.merkType],
    [5, 'Tahun Pemasangan', renderedData.tahunPemasangan],
    [6, 'Tinggi Tiang Penerima dari Atap', renderedData.tinggiTiangPenerima],
    [7, 'Tinggi Bangunan', renderedData.tinggiBangunan],
    [8, 'Jumlah Air Terminal', renderedData.jumlahAirTerminal],
    [9, 'Jumlah Box Kontrol', renderedData.jumlahBoxKontrol],
    [10, 'Jumlah Elektroda Pembumian', renderedData.jumlahElektrodaPembumian],
    [11, 'Radius Perlindungan', renderedData.radiusPerlindungan],
    [12, 'Jumlah Penghantar Penurunan', renderedData.jumlahDownConductor],
    [13, 'Jenis Penghantar Penurunan', renderedData.jenisDownConductor],
    [14, 'Diameter Tiang Penerima', renderedData.diameterTiangPenerima],
    [15, 'Luas Bangunan', renderedData.luasBangunan],
    [16, 'Jenis Konstruksi Bangunan', renderedData.jenisKonstruksi],
    [17, 'Atap Bangunan', renderedData.atapBangunan],
    [18, 'Dinding Bangunan', renderedData.dindingBangunan],
    [19, 'Lantai Bangunan', renderedData.lantaiBangunan],
    [20, 'Lokasi Pemasangan', renderedData.lokasiPemasangan],
  ];

  const checklistSections = Array.isArray(renderedData.checklistSections)
    ? renderedData.checklistSections
    : [];
  const continuityItems = Array.isArray(renderedData.continuityItems)
    ? renderedData.continuityItems
    : [];
  const groundingPoints = Array.isArray(renderedData.groundingPoints)
    ? renderedData.groundingPoints
    : [];

  return (
    <div className="space-y-6">
      <FolioPaperSheet pageLabel="Halaman Utama IPP">
        <PaperHeaderBand
          title="LAPORAN PEMERIKSAAN DAN PENGUJIAN"
          subtitle="INSTALASI PENYALUR PETIR"
          reportNumber={renderedData.reportNumber}
        />

        {/* Tabel Identitas Awal */}
        <table className="w-full mb-3 border-collapse" style={{ fontSize: '12px' }}>
          <tbody>
            {[
              ['Nama Pemilik', renderedData.companyName],
              ['Alamat', renderedData.companyAddress],
              ['Nama Perusahaan Pemeriksa', renderedData.inspectorCompany],
              ['Tanggal Pemeriksaan', renderedData.inspectionDate],
            ].map(([label, val]) => (
              <tr key={String(label)}>
                <td style={{ width: '195px', padding: '2px 4px', verticalAlign: 'top' }}>{label}</td>
                <td style={{ width: '14px', padding: '2px 2px', verticalAlign: 'top' }}>:</td>
                <td style={{ padding: '2px 4px', fontWeight: label === 'Nama Pemilik' ? 'bold' : 'normal' }}>
                  {val || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{ textAlign: 'justify', marginBottom: '12px' }}>
          Berdasarkan Peraturan Menteri Tenaga Kerja Republik Indonesia Nomor Per.02/MEN/1989 Tentang
          Pengawasan Instalasi Penyalur Petir dan Peraturan Menteri Ketenagakerjaan RI Nomor 31 Tahun 2015,
          hasil pemeriksaan dan pengujian yang dilaksanakan oleh{' '}
          <strong>{renderedData.inspectorName || '(Nama Ahli K3)'}</strong> Ahli Keselamatan dan Kesehatan
          Kerja Bidang Listrik dari PT. Aksara Riksa Perdana pada tanggal{' '}
          <strong>{renderedData.inspectionDate || '-'}</strong>, dengan hasil sebagai berikut:
        </p>

        {/* DATA UMUM (20 Baris Polos Rapi) */}
        <div style={{ fontWeight: 'bold', fontSize: '12.5px', marginBottom: '4px', textDecoration: 'underline' }}>
          I. DATA UMUM
        </div>
        <table className="w-full mb-4 border-collapse" style={{ fontSize: '12px' }}>
          <tbody>
            {dataUmumRows.map(([no, label, val]) => (
              <tr key={no} className="border-b border-dotted border-slate-200">
                <td style={{ width: '28px', padding: '2px 4px' }}>{no}.</td>
                <td style={{ width: '215px', padding: '2px 4px' }}>{label}</td>
                <td style={{ width: '12px', padding: '2px 2px' }}>:</td>
                <td style={{ padding: '2px 4px' }}>{val || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* PEMERIKSAAN & PENGUJIAN */}
        <div style={{ fontWeight: 'bold', fontSize: '12.5px', marginBottom: '4px', textDecoration: 'underline' }}>
          II. PEMERIKSAAN DAN PENGUJIAN
        </div>
        <div className="space-y-2 mb-4" style={{ textAlign: 'justify' }}>
          <p>
            <strong>Pemeriksaan Dokumen &amp; Visual:</strong> {renderedData.visualSummary || '-'}
          </p>
          <p>
            <strong>Pengukuran Tahanan Pembumian:</strong> {renderedData.measurementSummary || '-'}
          </p>
        </div>

        {/* CHECKLIST A-E (Header Warna Toska Mati) */}
        <div style={{ fontWeight: 'bold', fontSize: '12.5px', marginBottom: '6px', textDecoration: 'underline' }}>
          III. DATA CHECK LIST PEMERIKSAAN FISIK
        </div>
        <table className="w-full border-collapse mb-4" style={{ fontSize: '11.5px', border: '1px solid #374151' }}>
          <thead>
            <tr style={{ backgroundColor: TOSKA_MATI, color: '#FFFFFF' }}>
              <th style={{ border: '1px solid #374151', padding: '5px', width: '34px' }}>NO</th>
              <th style={{ border: '1px solid #374151', padding: '5px', textAlign: 'left' }}>OBYEK PEMERIKSAAN</th>
              <th style={{ border: '1px solid #374151', padding: '5px', width: '52px' }}>BAIK</th>
              <th style={{ border: '1px solid #374151', padding: '5px', width: '68px' }}>TDK BAIK</th>
              <th style={{ border: '1px solid #374151', padding: '5px', width: '150px', textAlign: 'left' }}>KETERANGAN</th>
            </tr>
          </thead>
          <tbody>
            {checklistSections.map((sec: any, sIdx: number) => (
              <React.Fragment key={`sec-wrap-${sIdx}`}>
                <tr key={`sec-${sIdx}`} style={{ backgroundColor: TOSKA_SUBTLE, fontWeight: 'bold' }}>
                  <td colSpan={5} style={{ border: '1px solid #374151', padding: '4px 6px' }}>
                    {sec.sectionLetter ? `${sec.sectionLetter}. ` : ''}
                    {sec.sectionTitle}
                  </td>
                </tr>
                {(sec.items || []).map((it: any, iIdx: number) => (
                  <tr key={`it-${sIdx}-${iIdx}`}>
                    <td style={{ border: '1px solid #374151', padding: '3px 4px', textAlign: 'center' }}>{it.no}</td>
                    <td style={{ border: '1px solid #374151', padding: '3px 6px' }}>{it.description}</td>
                    <td style={{ border: '1px solid #374151', padding: '3px 4px', textAlign: 'center' }}>{it.checkBaik}</td>
                    <td style={{ border: '1px solid #374151', padding: '3px 4px', textAlign: 'center' }}>{it.checkTidakBaik}</td>
                    <td style={{ border: '1px solid #374151', padding: '3px 6px' }}>{it.remarks || ''}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {/* TABEL KONTINUITAS */}
        {continuityItems.length > 0 && (
          <div className="mb-4">
            <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>
              HUBUNGAN ANTAR BAGIAN (KONTINUITAS)
            </div>
            <table className="w-full border-collapse" style={{ fontSize: '11.5px', border: '1px solid #374151' }}>
              <thead>
                <tr style={{ backgroundColor: TOSKA_MATI, color: '#FFFFFF' }}>
                  <th style={{ border: '1px solid #374151', padding: '5px', width: '34px' }}>NO</th>
                  <th style={{ border: '1px solid #374151', padding: '5px', textAlign: 'left' }}>SAMBUNGAN / KOMPONEN</th>
                  <th style={{ border: '1px solid #374151', padding: '5px', width: '52px' }}>BAIK</th>
                  <th style={{ border: '1px solid #374151', padding: '5px', width: '68px' }}>TDK BAIK</th>
                  <th style={{ border: '1px solid #374151', padding: '5px', width: '150px', textAlign: 'left' }}>KETERANGAN</th>
                </tr>
              </thead>
              <tbody>
                {continuityItems.map((it: any, idx: number) => (
                  <tr key={idx}>
                    <td style={{ border: '1px solid #374151', padding: '3px 4px', textAlign: 'center' }}>{it.no}</td>
                    <td style={{ border: '1px solid #374151', padding: '3px 6px' }}>{it.description}</td>
                    <td style={{ border: '1px solid #374151', padding: '3px 4px', textAlign: 'center' }}>{it.checkBaik}</td>
                    <td style={{ border: '1px solid #374151', padding: '3px 4px', textAlign: 'center' }}>{it.checkTidakBaik}</td>
                    <td style={{ border: '1px solid #374151', padding: '3px 6px' }}>{it.remarks || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PENGUKURAN GROUNDING & SIGMAT */}
        <div style={{ fontWeight: 'bold', fontSize: '12.5px', marginBottom: '4px', textDecoration: 'underline' }}>
          IV. HASIL PENGUJIAN TAHANAN PEMBUMIAN &amp; DIMENSI PENGHANTAR
        </div>
        <div className="mb-2" style={{ fontSize: '11.5px' }}>
          Alat Ukur: <strong>{renderedData.measuringTool}</strong> • Diameter Sigmat:{' '}
          <strong>{renderedData.hasilUkurSigmat || '-'} mm</strong> → Luas Penampang:{' '}
          <strong>{renderedData.luasPenampangHitung || '-'} mm²</strong> (Standar Min. 50 mm²)
        </div>
        <table className="w-full border-collapse mb-4" style={{ fontSize: '11.5px', border: '1px solid #374151' }}>
          <thead>
            <tr style={{ backgroundColor: TOSKA_MATI, color: '#FFFFFF' }}>
              <th style={{ border: '1px solid #374151', padding: '5px', width: '36px' }}>NO</th>
              <th style={{ border: '1px solid #374151', padding: '5px', textAlign: 'left' }}>TITIK PENGUKURAN</th>
              <th style={{ border: '1px solid #374151', padding: '5px', width: '115px' }}>HASIL UKUR (Ω)</th>
              <th style={{ border: '1px solid #374151', padding: '5px', textAlign: 'left' }}>KETERANGAN (BATAS ≤ 5 Ω)</th>
            </tr>
          </thead>
          <tbody>
            {groundingPoints.map((pt: any, idx: number) => (
              <tr key={idx}>
                <td style={{ border: '1px solid #374151', padding: '4px', textAlign: 'center' }}>{pt.no}</td>
                <td style={{ border: '1px solid #374151', padding: '4px 6px' }}>{pt.pointName}</td>
                <td style={{ border: '1px solid #374151', padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>
                  {pt.resistanceValue && pt.resistanceValue !== '-' ? `${pt.resistanceValue} Ω` : '-'}
                </td>
                <td style={{ border: '1px solid #374151', padding: '4px 6px' }}>{pt.pointRemarks}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* KESIMPULAN & SARAN */}
        <div style={{ fontWeight: 'bold', fontSize: '12.5px', marginBottom: '4px', textDecoration: 'underline' }}>
          V. KESIMPULAN
        </div>
        <p className="mb-3 whitespace-pre-line" style={{ textAlign: 'justify' }}>
          {renderedData.conclusion || '-'}
        </p>

        <div style={{ fontWeight: 'bold', fontSize: '12.5px', marginBottom: '4px', textDecoration: 'underline' }}>
          VI. SARAN - SARAN
        </div>
        <p className="mb-4 whitespace-pre-line" style={{ textAlign: 'justify' }}>
          {renderedData.recommendations || '-'}
        </p>

        <PaperSignatureBlock
          reportDateFormatted={renderedData.reportDate}
          inspectorRole="AK3 Bidang Listrik"
          inspectorName={renderedData.inspectorName}
          inspectorCertNumber={renderedData.inspectorCertNumber}
        />
      </FolioPaperSheet>

      <PaperAppendices
        gridPhotos={previewData.gridPhotos}
        jointPhoto={previewData.jointPhoto}
        bapAttachments={previewData.bapAttachments}
        skpPerusahaanImage={previewData.generalData.skpPerusahaanImage}
        skpAhliImage={previewData.generalData.skpAhliImage}
        extraAttachments={previewData.extraAttachments}
        showMedia={showMedia}
        apiBase={apiBase}
      />
    </div>
  );
}
