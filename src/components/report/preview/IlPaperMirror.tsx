// src/components/report/preview/IlPaperMirror.tsx
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

interface IlPaperMirrorProps {
  renderedData: Record<string, any>;
  previewData: ReportPreviewData;
  showMedia: boolean;
  apiBase: string;
}

export function IlPaperMirror({
  renderedData,
  previewData,
  showMedia,
  apiBase,
}: IlPaperMirrorProps) {
  const dataUmum12: Array<[number, string, string]> = [
    [1, 'Pemilik', renderedData.companyName],
    [2, 'Alamat', renderedData.companyAddress],
    [3, 'Instalatir Pemasang', renderedData.instalatirPemasang],
    [4, 'Sumber Tegangan', renderedData.sumberTegangan],
    [5, 'Sumber Daya Listrik', renderedData.sumberDayaListrik],
    [6, 'Daya Untuk Penerangan', renderedData.dayaPenerangan],
    [7, 'Daya Untuk Tenaga', renderedData.dayaTenaga],
    [8, 'Jumlah Phasa', renderedData.jumlahPhasa],
    [9, 'Frekuensi', renderedData.frekuensi],
    [10, 'Jenis Arus', renderedData.jenisArus],
    [11, 'Tegangan Kerja', renderedData.teganganKerja],
    [12, 'Lokasi', renderedData.lokasiPanel],
  ];

  const checklistSections = Array.isArray(renderedData.checklistSections)
    ? renderedData.checklistSections
    : [];

  return (
    <div className="space-y-6">
      <FolioPaperSheet pageLabel="Halaman Utama IL">
        <PaperHeaderBand
          title="LAPORAN PEMERIKSAAN DAN PENGUJIAN"
          subtitle="INSTALASI LISTRIK"
          reportNumber={renderedData.reportNumber}
        />

        {/* Identitas Awal */}
        <table className="w-full mb-3 border-collapse" style={{ fontSize: '12px' }}>
          <tbody>
            {[
              ['Nama Pemilik', renderedData.companyName],
              ['Alamat', renderedData.companyAddress],
              ['Nama Perusahaan Pemeriksa', renderedData.inspectorCompany],
              ['Tanggal Pemeriksaan', renderedData.inspectionDate],
              [
                'Pemeriksaan yang dilakukan',
                '1. Pemeriksaan Data Teknis\n2. Pemeriksaan Visual Panel LVMDP\n3. Pengujian',
              ],
            ].map(([label, val]) => (
              <tr key={String(label)}>
                <td style={{ width: '195px', padding: '2px 4px', verticalAlign: 'top' }}>{label}</td>
                <td style={{ width: '14px', padding: '2px 2px', verticalAlign: 'top' }}>:</td>
                <td
                  className="whitespace-pre-line"
                  style={{
                    padding: '2px 4px',
                    fontWeight: label === 'Nama Pemilik' ? 'bold' : 'normal',
                  }}
                >
                  {val || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p style={{ textAlign: 'justify', marginBottom: '12px' }}>
          Berdasarkan Undang-Undang No. 1 Tahun 1970 Tentang Keselamatan Kerja dan Peraturan Menteri
          Ketenagakerjaan Nomor 12 Tahun 2015 Tentang Keselamatan dan Kesehatan Kerja Listrik di Tempat Kerja
          serta Peraturan Menteri Ketenagakerjaan RI Nomor 33 Tahun 2015 Tentang Perubahan atas Peraturan
          Menteri Ketenagakerjaan Nomor 12 Tahun 2015 Tentang Keselamatan dan Kesehatan Kerja Listrik di Tempat
          Kerja. Hasil pemeriksaan dan pengujian yang dilaksanakan oleh{' '}
          <strong>{renderedData.inspectorName || '(Nama Ahli K3)'}</strong> Ahli Keselamatan dan Kesehatan Kerja
          Bidang Listrik dari PT. Aksara Riksa Perdana, pada tanggal{' '}
          <strong>{renderedData.inspectionDate || '-'}</strong>, dengan hasil sebagai berikut :
        </p>

        {/* 12 DATA UMUM */}
        <div style={{ fontWeight: 'bold', fontSize: '12.5px', marginBottom: '4px' }}>DATA UMUM</div>
        <table className="w-full mb-4 border-collapse" style={{ fontSize: '12px' }}>
          <tbody>
            {dataUmum12.map(([no, label, val]) => (
              <tr key={no} className="border-b border-dotted border-slate-200">
                <td style={{ width: '28px', padding: '2px 4px' }}>{no}.</td>
                <td style={{ width: '215px', padding: '2px 4px' }}>{label}</td>
                <td style={{ width: '12px', padding: '2px 2px' }}>:</td>
                <td style={{ padding: '2px 4px' }}>{val || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* PEMERIKSAAN DAN PENGUJIAN */}
        <div style={{ fontWeight: 'bold', fontSize: '12.5px', marginBottom: '4px' }}>
          PEMERIKSAAN DAN PENGUJIAN
        </div>
        <div className="space-y-1.5 mb-4" style={{ textAlign: 'justify' }}>
          <p>
            <strong>PEMERIKSAAN :</strong> {renderedData.visualSummary || '-'}
          </p>
          <p>
            <strong>PENGUJIAN :</strong> {renderedData.testingSummary || '-'}
          </p>
        </div>

        {/* DATA CHECK LIST PEMERIKSAAN (Header Toska Mati) */}
        <div style={{ fontWeight: 'bold', fontSize: '12.5px', marginBottom: '6px' }}>
          DATA CHECK LIST PEMERIKSAAN
        </div>
        <table className="w-full border-collapse mb-5" style={{ fontSize: '11px', border: '1px solid #374151' }}>
          <thead>
            <tr style={{ backgroundColor: TOSKA_MATI, color: '#FFFFFF' }}>
              <th style={{ border: '1px solid #374151', padding: '5px', width: '32px' }}>NO</th>
              <th style={{ border: '1px solid #374151', padding: '5px', textAlign: 'left' }}>OBYEK</th>
              <th style={{ border: '1px solid #374151', padding: '5px', textAlign: 'left', width: '145px' }}>HASIL</th>
              <th style={{ border: '1px solid #374151', padding: '5px', textAlign: 'left', width: '125px' }}>NILAI RUJUKAN</th>
              <th style={{ border: '1px solid #374151', padding: '5px', textAlign: 'left', width: '95px' }}>METODE</th>
            </tr>
          </thead>
          <tbody>
            {checklistSections.map((sec: any, sIdx: number) => (
              <React.Fragment key={`il-sec-wrap-${sIdx}`}>
                <tr key={`il-sec-${sIdx}`} style={{ backgroundColor: TOSKA_SUBTLE, fontWeight: 'bold' }}>
                  <td colSpan={5} style={{ border: '1px solid #374151', padding: '4px 6px' }}>
                    {sec.sectionTitle}
                  </td>
                </tr>
                {(sec.items || []).map((it: any, iIdx: number) => (
                  <tr key={`il-it-${sIdx}-${iIdx}`}>
                    <td style={{ border: '1px solid #374151', padding: '3px 4px', textAlign: 'center' }}>{it.no}</td>
                    <td style={{ border: '1px solid #374151', padding: '3px 6px' }}>{it.obyek}</td>
                    <td style={{ border: '1px solid #374151', padding: '3px 6px', fontWeight: 'bold' }}>{it.hasil}</td>
                    <td style={{ border: '1px solid #374151', padding: '3px 6px' }}>{it.nilaiRujukan}</td>
                    <td style={{ border: '1px solid #374151', padding: '3px 6px' }}>{it.metode}</td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>

        {/* ANALISIS PUIL 2011 */}
        <div style={{ fontWeight: 'bold', fontSize: '12.5px', marginBottom: '6px' }}>ANALISIS</div>

        <div className="mb-3" style={{ fontSize: '11.5px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>Perhitungan Arus Nominal (In)</div>
          <table className="w-full mb-1.5 border-collapse">
            <tbody>
              <tr>
                <td style={{ width: '175px', padding: '1px 4px' }}>Daya Terpasang</td>
                <td style={{ width: '12px' }}>:</td>
                <td>{renderedData.dayaTerpasangKva} kVA</td>
              </tr>
              <tr>
                <td style={{ padding: '1px 4px' }}>Tegangan</td>
                <td>:</td>
                <td>{renderedData.teganganVolt} V</td>
              </tr>
              <tr>
                <td style={{ padding: '1px 4px' }}>Cos Phi (cos φ)</td>
                <td>:</td>
                <td>{renderedData.cosPhi}</td>
              </tr>
              <tr>
                <td style={{ padding: '1px 4px' }}>Untuk Penghantar (KHA)</td>
                <td>:</td>
                <td>1,25 × In (PUIL 2011 - 5.5.4.3)</td>
              </tr>
              <tr>
                <td style={{ padding: '1px 4px' }}>Daya Aktif (P)</td>
                <td>:</td>
                <td>
                  {renderedData.dayaTerpasangKva} kVA × {renderedData.cosPhi} = {renderedData.dayaAktifKw} kW ={' '}
                  {renderedData.dayaAktifWatt} Watt
                </td>
              </tr>
            </tbody>
          </table>
          <div className="pl-2 space-y-0.5">
            <div>In = P / (V × cos φ × √3)</div>
            <div>
              In = {renderedData.dayaAktifWatt} / ({renderedData.inDenominatorExpr})
            </div>
            <div>
              In = {renderedData.dayaAktifWatt} / {renderedData.inDenominatorVal} ={' '}
              <strong>{renderedData.arusNominal} Ampere</strong>
            </div>
          </div>
        </div>

        <div className="mb-3" style={{ fontSize: '11.5px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>Perhitungan KHA Penghantar Utama</div>
          <div className="pl-2 mb-1.5">
            <div>KHA = 1,25 × In</div>
            <div>
              KHA = 1,25 × {renderedData.arusNominal} A = <strong>{renderedData.khaHitung} A</strong>
            </div>
          </div>
          <table className="w-full mb-1 border-collapse">
            <tbody>
              <tr>
                <td style={{ width: '175px', padding: '1px 4px' }}>Jenis Kabel</td>
                <td style={{ width: '12px' }}>:</td>
                <td>{renderedData.jenisKabel}</td>
              </tr>
              <tr>
                <td style={{ padding: '1px 4px' }}>Ukuran Kabel</td>
                <td>:</td>
                <td>{renderedData.ukuranKabel}</td>
              </tr>
              <tr>
                <td style={{ padding: '1px 4px' }}>Metode Instalasi</td>
                <td>:</td>
                <td>{renderedData.instalasiKabel}</td>
              </tr>
              <tr>
                <td style={{ padding: '1px 4px' }}>KHA dari kabel tersebut</td>
                <td>:</td>
                <td>
                  <strong>{renderedData.khaKabel} A</strong> ({renderedData.instalasiKabel}) (PUIL 2011)
                </td>
              </tr>
            </tbody>
          </table>
          <div>
            <strong>Kesimpulan :</strong> {renderedData.khaConclusion}
          </div>
        </div>

        <div className="mb-3" style={{ fontSize: '11.5px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>
            Perhitungan Pembatas Arus atau Rating Proteksi Utama
          </div>
          <table className="w-full mb-1 border-collapse">
            <tbody>
              <tr>
                <td style={{ width: '175px', padding: '1px 4px' }}>Jenis Proteksi</td>
                <td style={{ width: '12px' }}>:</td>
                <td>{renderedData.jenisProteksi}</td>
              </tr>
              <tr>
                <td style={{ padding: '1px 4px' }}>Kapasitas Terpasang</td>
                <td>:</td>
                <td>{renderedData.kapasitasProteksi} A</td>
              </tr>
              <tr>
                <td style={{ padding: '1px 4px' }}>Arus Nominal (In)</td>
                <td>:</td>
                <td>{renderedData.arusNominal} A</td>
              </tr>
            </tbody>
          </table>
          <div className="pl-2 mb-1">
            <div>Rating Utama CB = 115% × In</div>
            <div>
              Rating Utama CB = 1,15 × {renderedData.arusNominal} A = <strong>{renderedData.ratingCbHitung} A</strong>
            </div>
          </div>
          <div>
            <strong>Kesimpulan :</strong> {renderedData.proteksiConclusion}
          </div>
        </div>

        <div className="mb-4" style={{ fontSize: '11.5px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>Perhitungan Keseimbangan Beban RST</div>
          <table className="w-full mb-1 border-collapse">
            <tbody>
              <tr>
                <td style={{ width: '175px', padding: '1px 4px' }}>Arus Phasa R (IR)</td>
                <td style={{ width: '12px' }}>:</td>
                <td>{renderedData.arusR} A</td>
              </tr>
              <tr>
                <td style={{ padding: '1px 4px' }}>Arus Phasa S (IS)</td>
                <td>:</td>
                <td>{renderedData.arusS} A</td>
              </tr>
              <tr>
                <td style={{ padding: '1px 4px' }}>Arus Phasa T (IT)</td>
                <td>:</td>
                <td>{renderedData.arusT} A</td>
              </tr>
            </tbody>
          </table>
          <div className="pl-2 space-y-0.5 mb-1">
            <div>
              I rata-rata = (IR + IS + IT) / 3 = ({renderedData.arusR} + {renderedData.arusS} +{' '}
              {renderedData.arusT}) / 3 = {renderedData.arusTotal} / 3 ={' '}
              <strong>{renderedData.arusRataRata} A</strong>
            </div>
            <div>
              a = IR / I rata-rata = {renderedData.arusR} / {renderedData.arusRataRata} = {renderedData.rasioA}
            </div>
            <div>
              b = IS / I rata-rata = {renderedData.arusS} / {renderedData.arusRataRata} = {renderedData.rasioB}
            </div>
            <div>
              c = IT / I rata-rata = {renderedData.arusT} / {renderedData.arusRataRata} = {renderedData.rasioC}
            </div>
            <div>
              I unbalance (%) = [ |a - 1| + |b - 1| + |c - 1| ] / 3 × 100% = [ {renderedData.devA} +{' '}
              {renderedData.devB} + {renderedData.devC} ] / 3 × 100% = {renderedData.devTotal} / 3 × 100% ={' '}
              <strong>{renderedData.unbalancePercent} %</strong>
            </div>
          </div>
          <div>
            <strong>Kesimpulan :</strong> {renderedData.unbalanceConclusion}
          </div>
        </div>

        {/* KESIMPULAN & SYARAT-SYARAT */}
        <div style={{ fontWeight: 'bold', fontSize: '12.5px', marginBottom: '4px' }}>KESIMPULAN</div>
        <p className="mb-3 whitespace-pre-line" style={{ textAlign: 'justify' }}>
          {renderedData.conclusion || '-'}
        </p>

        <div style={{ fontWeight: 'bold', fontSize: '12.5px', marginBottom: '4px' }}>SYARAT - SYARAT</div>
        <p className="mb-2 whitespace-pre-line" style={{ textAlign: 'justify' }}>
          {renderedData.recommendations || '-'}
        </p>
        {renderedData.closingNote && (
          <p className="mb-2 whitespace-pre-line" style={{ textAlign: 'justify' }}>
            {renderedData.closingNote}
          </p>
        )}
        <p className="mb-2" style={{ textAlign: 'justify' }}>
          Demikian Laporan Pemeriksaan dan Pengujian Instalasi Listrik ini dibuat, untuk diketahui dan
          dipergunakan dengan sebagaimana mestinya. Dokumentasi terlampir.
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
